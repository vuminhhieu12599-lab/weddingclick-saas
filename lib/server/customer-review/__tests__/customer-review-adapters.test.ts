import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Task 030B service_role adapters, with the service_role client mocked:
 * the RPC repository calls exactly the two 0037 RPCs, and the CUSTOMER
 * REVIEW MEDIA SIGNING ONLY signer signs exactly the given pinned paths.
 * Plus the public feedback HTTP handler mapping.
 */

const calls: { kind: string; args: unknown[] }[] = [];
let rpcResult: { data: unknown; error: { code: string; message: string } | null } = { data: null, error: null };
let signResult: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("../../supabase/service-role-client", () => ({
  createServiceRoleSupabaseClient: () => {
    calls.push({ kind: "client", args: [] });
    return {
      rpc: async (...args: unknown[]) => (calls.push({ kind: "rpc", args }), rpcResult),
      from: (...args: unknown[]) => {
        calls.push({ kind: "from", args });
        throw new Error("table access is not allowed");
      },
      storage: {
        from: (bucket: string) => ({
          createSignedUrls: async (...args: unknown[]) => (calls.push({ kind: "sign", args: [bucket, ...args] }), signResult),
        }),
      },
    };
  },
}));

const { getServiceRoleCustomerReviewGateway } = await import("../../supabase/customer-review-repository");
const { createServiceRoleCustomerReviewMediaSigner } = await import("../../supabase/customer-review-media-signer");
const { handleSubmitReviewFeedbackRequest } = await import("../../routes/customer-review");
const { CustomerReviewConflictError } = await import("../customer-review-rpc-error-codes");
const { ApiError } = await import("../../errors/api-error");
const { generateAccessToken } = await import("../../auth/access-token-crypto");

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const LINK_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "f0000000-0000-4000-8000-0000000000a1";
const stamp = "2026-10-03T04:11:56.123456+00:00";

beforeEach(() => {
  calls.length = 0;
  rpcResult = { data: null, error: null };
  signResult = { data: [], error: null };
});

describe("customer review RPC repository (service_role, 0037 RPCs only)", () => {
  it("submit calls submit_review_feedback with exactly the validated context and checks the echoed row", async () => {
    rpcResult = {
      data: [{ id: "a0000000-0000-4000-8000-000000000009", project_id: PROJECT_ID, invitation_version_id: VERSION_ID, feedback_type: "APPROVAL", created_at: stamp, project_status: "APPROVED" }],
      error: null,
    };
    const result = await getServiceRoleCustomerReviewGateway().submitReviewFeedback({
      projectId: PROJECT_ID,
      accessLinkId: LINK_ID,
      invitationVersionId: VERSION_ID,
      feedbackType: "APPROVAL",
      message: null,
    });
    expect(calls.filter((c) => c.kind === "rpc")).toEqual([
      {
        kind: "rpc",
        args: ["submit_review_feedback", { p_project_id: PROJECT_ID, p_access_link_id: LINK_ID, p_invitation_version_id: VERSION_ID, p_feedback_type: "APPROVAL", p_message: null }],
      },
    ]);
    expect(result.projectStatus).toBe("APPROVED");
    expect(calls.some((c) => c.kind === "from")).toBe(false);
  });

  it("a mismatched echoed row or an unknown status is never forwarded as success", async () => {
    rpcResult = {
      data: [{ id: "a0000000-0000-4000-8000-000000000009", project_id: PROJECT_ID, invitation_version_id: VERSION_ID, feedback_type: "COMMENT", created_at: stamp, project_status: "PUBLISHED_NOW" }],
      error: null,
    };
    await expect(
      getServiceRoleCustomerReviewGateway().submitReviewFeedback({ projectId: PROJECT_ID, accessLinkId: LINK_ID, invitationVersionId: VERSION_ID, feedbackType: "APPROVAL", message: null }),
    ).rejects.toThrow(/Unexpected result shape/);
  });

  it("RV016 from the RPC becomes a REVIEW_SUPERSEDED conflict; read maps RV012 to REVOKED_TOKEN", async () => {
    rpcResult = { data: null, error: { code: "RV016", message: "raw db text" } };
    await expect(
      getServiceRoleCustomerReviewGateway().submitReviewFeedback({ projectId: PROJECT_ID, accessLinkId: LINK_ID, invitationVersionId: VERSION_ID, feedbackType: "APPROVAL", message: null }),
    ).rejects.toMatchObject({ kind: "CONFLICT", reason: "REVIEW_SUPERSEDED" });
    rpcResult = { data: null, error: { code: "RV012", message: "raw" } };
    await expect(getServiceRoleCustomerReviewGateway().getCustomerReview({ projectId: PROJECT_ID, accessLinkId: LINK_ID })).rejects.toMatchObject({ kind: "REVOKED_TOKEN" });
    expect(calls.filter((c) => c.kind === "rpc").map((c) => c.args[0])).toEqual(["submit_review_feedback", "get_customer_review"]);
  });

  it("read rejects a malformed get_customer_review result instead of trusting a cast", async () => {
    rpcResult = { data: { projectId: PROJECT_ID, projectStatus: "CUSTOMER_REVIEW", hasVariantPolicy: true, feedbackOpen: true, variants: [{ variant: "GROOM", review: { id: "x" } }] }, error: null };
    await expect(getServiceRoleCustomerReviewGateway().getCustomerReview({ projectId: PROJECT_ID, accessLinkId: LINK_ID })).rejects.toThrow(/Unexpected result shape/);
  });
});

describe("CUSTOMER REVIEW MEDIA SIGNING ONLY signer", () => {
  it("signs exactly the given pinned paths in project-media for a short TTL and maps ids; failed items stay unsigned", async () => {
    signResult = {
      data: [
        { path: "p/a.jpg", signedUrl: "https://signed.test/a", error: null },
        { path: "p/b.jpg", signedUrl: null, error: "Object not found" },
      ],
      error: null,
    };
    const urls = await createServiceRoleCustomerReviewMediaSigner()([
      { id: "a", storagePath: "p/a.jpg" },
      { id: "b", storagePath: "p/b.jpg" },
    ]);
    expect(calls.filter((c) => c.kind === "sign")).toEqual([{ kind: "sign", args: ["project-media", ["p/a.jpg", "p/b.jpg"], 3600] }]);
    expect([...urls]).toEqual([["a", "https://signed.test/a"]]);
    expect(calls.some((c) => c.kind === "rpc" || c.kind === "from")).toBe(false);
  });

  it("nothing to sign creates no service_role client at all; a whole-batch failure throws", async () => {
    expect((await createServiceRoleCustomerReviewMediaSigner()([])).size).toBe(0);
    expect(calls).toEqual([]);
    signResult = { data: null, error: { message: "boom" } };
    await expect(createServiceRoleCustomerReviewMediaSigner()([{ id: "a", storagePath: "p/a.jpg" }])).rejects.toThrow(/Failed to sign/);
  });
});

describe("POST /api/v2/public/review-feedback handler", () => {
  const { rawToken } = generateAccessToken();
  const deps = (error?: Error) => ({
    resolution: {
      lookupByTokenHash: async () => ({ id: LINK_ID, projectId: PROJECT_ID, linkType: "REVIEW" as const, expiresAt: null, revokedAt: null }),
      touchLastUsedAt: async () => undefined,
    },
    reviews: {
      submitReviewFeedback: async () => {
        if (error) throw error;
        return { id: "fb", invitationVersionId: VERSION_ID, feedbackType: "COMMENT" as const, createdAt: stamp, projectStatus: "CUSTOMER_REVIEW" as const };
      },
    },
  });
  const body = async () => ({ invitationVersionId: VERSION_ID, feedbackType: "COMMENT", message: "Đẹp" });

  it("no bearer token → 401; success → 201 with no-store", async () => {
    expect((await handleSubmitReviewFeedbackRequest(null, body, deps())).status).toBe(401);
    const ok = await handleSubmitReviewFeedbackRequest(`Bearer ${rawToken}`, body, deps());
    expect(ok.status).toBe(201);
    expect(ok.headers["Cache-Control"]).toBe("no-store");
  });

  it("conflict → 409 with its stable reason; revoked → 410; unexpected → generic 500", async () => {
    const conflict = await handleSubmitReviewFeedbackRequest(`Bearer ${rawToken}`, body, deps(new CustomerReviewConflictError("x", "REVIEW_SUPERSEDED")));
    expect(conflict).toMatchObject({ status: 409, body: { reason: "REVIEW_SUPERSEDED" } });
    const revoked = await handleSubmitReviewFeedbackRequest(`Bearer ${rawToken}`, body, deps(new ApiError("REVOKED_TOKEN", "Access link has been revoked")));
    expect(revoked.status).toBe(410);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const crash = await handleSubmitReviewFeedbackRequest(`Bearer ${rawToken}`, body, deps(new Error("pg: secret detail")));
    expect(crash).toMatchObject({ status: 500, body: { error: "Internal server error" } });
    expect(JSON.stringify(crash)).not.toContain("secret detail");
    spy.mockRestore();
  });
});
