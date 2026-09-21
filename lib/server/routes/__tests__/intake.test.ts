import { describe, expect, it } from "vitest";

import type { AccessLinkResolutionRepository } from "../../supabase/access-link-resolution-repository";
import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { IntakeStaffGateway } from "../../intake/intake-staff-gateway";
import type { IntakeSubmitGateway } from "../../intake/intake-submit-gateway";
import type {
  ApplyIntakeSubmissionResult,
  IntakeSubmissionRecord,
  RejectIntakeSubmissionResult,
  SubmitIntakeSubmissionResult,
} from "../../intake/intake-types";
import {
  handleApplyIntakeSubmissionRequest,
  handleGetIntakeSubmissionRequest,
  handleListIntakeSubmissionsRequest,
  handleRejectIntakeSubmissionRequest,
  handleSubmitIntakeRequest,
} from "../intake";

interface FakeClient {
  marker: string;
}

function createFakeAuthGateway(options: {
  userId?: string | null;
  profile?: { role: string; displayName: string } | null;
}): StaffAuthGateway<FakeClient> {
  return {
    createClient: (accessToken) => ({ marker: `client-for-${accessToken}` }),
    async getAuthenticatedUserId() {
      return options.userId ?? null;
    },
    async getActiveStaffProfile() {
      return options.profile ?? null;
    },
  };
}

const activeStaffAuth = createFakeAuthGateway({
  userId: "staff-1",
  profile: { role: "STAFF", displayName: "Test Staff" },
});
const nonStaffAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

const projectId = "11111111-1111-1111-1111-111111111111";
const submissionId = "22222222-2222-2222-2222-222222222222";
const accessLinkId = "33333333-3333-3333-3333-333333333333";
const rawToken = "a".repeat(43);

const validWeddingDetails = {
  groomName: "Nguyễn Văn Hiếu",
  brideName: "Trần Thị Bình",
  groomFather: null,
  groomMother: null,
  brideFather: null,
  brideMother: null,
  groomFamilyAddress: null,
  brideFamilyAddress: null,
  invitationMessage: null,
  loveStory: null,
  lunarDateDisplay: null,
  additionalNote: null,
  groomBankName: null,
  groomBankAccountName: null,
  groomBankAccountNumber: null,
  groomBankQrMediaId: null,
  brideBankName: null,
  brideBankAccountName: null,
  brideBankAccountNumber: null,
  brideBankQrMediaId: null,
};

function fakeResolutionRepository(
  row: {
    id: string;
    projectId: string;
    linkType: "INTAKE" | "REVIEW" | "PORTAL";
    expiresAt: string | null;
    revokedAt: string | null;
  } | null,
): AccessLinkResolutionRepository {
  return {
    async lookupByTokenHash() {
      return row;
    },
    async touchLastUsedAt() {},
  };
}

function fakeSubmitGateway(
  result?: SubmitIntakeSubmissionResult,
  onSubmit?: IntakeSubmitGateway["submitIntakeSubmission"],
): IntakeSubmitGateway {
  return {
    async submitIntakeSubmission(params) {
      if (onSubmit) {
        return onSubmit(params);
      }
      return (
        result ?? {
          id: submissionId,
          projectId: params.projectId,
          status: "PENDING",
          submittedAt: "2026-09-19T00:00:00.000Z",
        }
      );
    },
  };
}

/** Lazy body reader — records whether/when it was invoked (Finding A ordering tests). */
function bodyReader(body: unknown, onRead?: () => void): () => Promise<unknown> {
  return async () => {
    onRead?.();
    return body;
  };
}

/** Simulates a malformed-JSON body: the reader itself throws. */
function throwingBodyReader(onRead?: () => void): () => Promise<unknown> {
  return async () => {
    onRead?.();
    throw new SyntaxError("Unexpected token in JSON");
  };
}

describe("handleSubmitIntakeRequest", () => {
  it("returns 401 for a missing Authorization header WITHOUT reading the body", async () => {
    let bodyRead = false;
    const result = await handleSubmitIntakeRequest(
      null,
      bodyReader({ weddingDetails: validWeddingDetails }, () => {
        bodyRead = true;
      }),
      fakeResolutionRepository(null),
      fakeSubmitGateway(),
    );
    expect(result.status).toBe(401);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
    expect(bodyRead).toBe(false);
  });

  it("returns 401 for the wrong auth scheme WITHOUT reading the body", async () => {
    let bodyRead = false;
    const result = await handleSubmitIntakeRequest(
      "Basic abc123",
      bodyReader({ weddingDetails: validWeddingDetails }, () => {
        bodyRead = true;
      }),
      fakeResolutionRepository(null),
      fakeSubmitGateway(),
    );
    expect(result.status).toBe(401);
    expect(bodyRead).toBe(false);
  });

  it("returns 401 for an empty bearer credential WITHOUT reading the body", async () => {
    let bodyRead = false;
    const result = await handleSubmitIntakeRequest(
      "Bearer ",
      bodyReader({ weddingDetails: validWeddingDetails }, () => {
        bodyRead = true;
      }),
      fakeResolutionRepository(null),
      fakeSubmitGateway(),
    );
    expect(result.status).toBe(401);
    expect(bodyRead).toBe(false);
  });

  it("returns 404 for a malformed bearer token (frozen resolver NOT_FOUND) WITHOUT reading the body", async () => {
    let bodyRead = false;
    const result = await handleSubmitIntakeRequest(
      "Bearer not-shaped-right",
      bodyReader({ weddingDetails: validWeddingDetails }, () => {
        bodyRead = true;
      }),
      fakeResolutionRepository(null),
      fakeSubmitGateway(),
    );
    expect(result.status).toBe(404);
    expect(bodyRead).toBe(false);
  });

  it("returns 404 for an unknown token WITHOUT reading the body", async () => {
    let bodyRead = false;
    const result = await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      bodyReader({ weddingDetails: validWeddingDetails }, () => {
        bodyRead = true;
      }),
      fakeResolutionRepository(null),
      fakeSubmitGateway(),
    );
    expect(result.status).toBe(404);
    expect(bodyRead).toBe(false);
  });

  it("returns 404 for a token resolved to the wrong INTAKE purpose WITHOUT reading the body", async () => {
    let bodyRead = false;
    const result = await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      bodyReader({ weddingDetails: validWeddingDetails }, () => {
        bodyRead = true;
      }),
      fakeResolutionRepository({
        id: accessLinkId,
        projectId,
        linkType: "REVIEW",
        expiresAt: null,
        revokedAt: null,
      }),
      fakeSubmitGateway(),
    );
    expect(result.status).toBe(404);
    expect(bodyRead).toBe(false);
  });

  it("returns 410 REVOKED_TOKEN for a revoked link WITHOUT reading the body", async () => {
    let bodyRead = false;
    const result = await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      bodyReader({ weddingDetails: validWeddingDetails }, () => {
        bodyRead = true;
      }),
      fakeResolutionRepository({
        id: accessLinkId,
        projectId,
        linkType: "INTAKE",
        expiresAt: null,
        revokedAt: "2020-01-01T00:00:00.000Z",
      }),
      fakeSubmitGateway(),
    );
    expect(result.status).toBe(410);
    expect(result.body).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(bodyRead).toBe(false);
  });

  it("returns 410 EXPIRED_TOKEN for an expired link WITHOUT reading the body", async () => {
    let bodyRead = false;
    const result = await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      bodyReader({ weddingDetails: validWeddingDetails }, () => {
        bodyRead = true;
      }),
      fakeResolutionRepository({
        id: accessLinkId,
        projectId,
        linkType: "INTAKE",
        expiresAt: "2020-01-01T00:00:00.000Z",
        revokedAt: null,
      }),
      fakeSubmitGateway(),
    );
    expect(result.status).toBe(410);
    expect(bodyRead).toBe(false);
  });

  it("returns 400 for a body-reader failure (e.g. malformed JSON) AFTER successful resolution", async () => {
    let called = false;
    const result = await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      throwingBodyReader(),
      fakeResolutionRepository({
        id: accessLinkId,
        projectId,
        linkType: "INTAKE",
        expiresAt: null,
        revokedAt: null,
      }),
      fakeSubmitGateway(undefined, async () => {
        called = true;
        throw new Error("should not be called");
      }),
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Request body must be valid JSON" });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
    expect(called).toBe(false);
  });

  it("returns 400 for a structurally invalid (but syntactically valid) body, after successful resolution", async () => {
    let called = false;
    const result = await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      bodyReader({ weddingDetails: validWeddingDetails, projectId: "attacker-supplied" }),
      fakeResolutionRepository({
        id: accessLinkId,
        projectId,
        linkType: "INTAKE",
        expiresAt: null,
        revokedAt: null,
      }),
      fakeSubmitGateway(undefined, async () => {
        called = true;
        throw new Error("should not be called");
      }),
    );
    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });

  it("reads the body only after resolution has already succeeded", async () => {
    let resolved = false;
    let bodyReadAfterResolution: boolean | undefined;
    const resolution: AccessLinkResolutionRepository = {
      async lookupByTokenHash() {
        resolved = true;
        return {
          id: accessLinkId,
          projectId,
          linkType: "INTAKE",
          expiresAt: null,
          revokedAt: null,
        };
      },
      async touchLastUsedAt() {},
    };

    await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      bodyReader({ weddingDetails: validWeddingDetails }, () => {
        bodyReadAfterResolution = resolved;
      }),
      resolution,
      fakeSubmitGateway(),
    );

    expect(bodyReadAfterResolution).toBe(true);
  });

  it("returns 201 on success with the narrow response shape, mapping submittedAt to createdAt", async () => {
    const result = await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      bodyReader({ weddingDetails: validWeddingDetails }),
      fakeResolutionRepository({
        id: accessLinkId,
        projectId,
        linkType: "INTAKE",
        expiresAt: null,
        revokedAt: null,
      }),
      fakeSubmitGateway({
        id: submissionId,
        projectId,
        status: "PENDING",
        submittedAt: "2026-09-19T00:00:00.000Z",
      }),
    );

    expect(result.status).toBe(201);
    expect(result.body).toEqual({
      id: submissionId,
      projectId,
      status: "PENDING",
      createdAt: "2026-09-19T00:00:00.000Z",
    });
  });

  it("every response carries Cache-Control: no-store", async () => {
    const success = await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      bodyReader({ weddingDetails: validWeddingDetails }),
      fakeResolutionRepository({
        id: accessLinkId,
        projectId,
        linkType: "INTAKE",
        expiresAt: null,
        revokedAt: null,
      }),
      fakeSubmitGateway(),
    );
    expect(success.headers?.["Cache-Control"]).toBe("no-store");

    const failure = await handleSubmitIntakeRequest(
      null,
      bodyReader({}),
      fakeResolutionRepository(null),
      fakeSubmitGateway(),
    );
    expect(failure.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("never echoes token/hash/hint/full weddingDetails/review fields in the success response", async () => {
    const result = await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      bodyReader({ weddingDetails: validWeddingDetails }),
      fakeResolutionRepository({
        id: accessLinkId,
        projectId,
        linkType: "INTAKE",
        expiresAt: null,
        revokedAt: null,
      }),
      fakeSubmitGateway({
        id: submissionId,
        projectId,
        status: "PENDING",
        submittedAt: "2026-09-19T00:00:00.000Z",
      }),
    );

    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toContain(accessLinkId);
    expect(serialized).not.toMatch(/groomName|reviewedBy/);
  });

  it("maps an unexpected gateway failure to a generic 500 without leaking details", async () => {
    const result = await handleSubmitIntakeRequest(
      `Bearer ${rawToken}`,
      bodyReader({ weddingDetails: validWeddingDetails }),
      fakeResolutionRepository({
        id: accessLinkId,
        projectId,
        linkType: "INTAKE",
        expiresAt: null,
        revokedAt: null,
      }),
      fakeSubmitGateway(undefined, async () => {
        throw new Error("raw postgres detail");
      }),
    );
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });
});

const existingSubmission: IntakeSubmissionRecord = {
  id: submissionId,
  projectId,
  accessLinkId,
  status: "PENDING",
  submittedAt: "2026-09-19T00:00:00.000Z",
  reviewedBy: null,
  reviewedAt: null,
  staffNote: null,
  weddingDetails: validWeddingDetails,
};

function createFakeStaffGateway(options?: {
  projectExists?: IntakeStaffGateway<FakeClient>["projectExists"];
  listIntakeSubmissionsByProjectId?: IntakeStaffGateway<FakeClient>["listIntakeSubmissionsByProjectId"];
  getIntakeSubmissionById?: IntakeStaffGateway<FakeClient>["getIntakeSubmissionById"];
  applyIntakeSubmission?: IntakeStaffGateway<FakeClient>["applyIntakeSubmission"];
  rejectIntakeSubmission?: IntakeStaffGateway<FakeClient>["rejectIntakeSubmission"];
}): IntakeStaffGateway<FakeClient> {
  return {
    async projectExists(client, pid) {
      return options?.projectExists ? options.projectExists(client, pid) : true;
    },
    async listIntakeSubmissionsByProjectId(client, pid) {
      return options?.listIntakeSubmissionsByProjectId
        ? options.listIntakeSubmissionsByProjectId(client, pid)
        : [existingSubmission];
    },
    async getIntakeSubmissionById(client, pid, sid) {
      return options?.getIntakeSubmissionById
        ? options.getIntakeSubmissionById(client, pid, sid)
        : existingSubmission;
    },
    async applyIntakeSubmission(client, pid, sid) {
      if (options?.applyIntakeSubmission) {
        return options.applyIntakeSubmission(client, pid, sid);
      }
      return {
        id: sid,
        projectId: pid,
        status: "APPLIED",
        reviewedBy: "staff-1",
        reviewedAt: "2026-09-19T00:00:00.000Z",
        weddingDetailsChanged: true,
      };
    },
    async rejectIntakeSubmission(client, pid, sid, staffNote) {
      if (options?.rejectIntakeSubmission) {
        return options.rejectIntakeSubmission(client, pid, sid, staffNote);
      }
      return {
        id: sid,
        projectId: pid,
        status: "REJECTED",
        reviewedBy: "staff-1",
        reviewedAt: "2026-09-19T00:00:00.000Z",
        staffNote,
      };
    },
  };
}

describe("handleListIntakeSubmissionsRequest", () => {
  it("returns 401 without an Authorization header", async () => {
    const result = await handleListIntakeSubmissionsRequest(
      null,
      projectId,
      activeStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const result = await handleListIntakeSubmissionsRequest(
      "Bearer token",
      projectId,
      nonStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed project id", async () => {
    const result = await handleListIntakeSubmissionsRequest(
      "Bearer good-token",
      "not-a-uuid",
      activeStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(400);
  });

  it("returns 200 with camelCase data scoped to the project", async () => {
    const result = await handleListIntakeSubmissionsRequest(
      "Bearer good-token",
      projectId,
      activeStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: [existingSubmission] });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("never exposes token/token_hash/token_hint fields", async () => {
    const result = await handleListIntakeSubmissionsRequest(
      "Bearer good-token",
      projectId,
      activeStaffAuth,
      createFakeStaffGateway(),
    );
    expect(JSON.stringify(result.body)).not.toMatch(/token_hash|token_hint/);
  });
});

describe("handleGetIntakeSubmissionRequest", () => {
  it("returns 401 without an Authorization header", async () => {
    const result = await handleGetIntakeSubmissionRequest(
      null,
      projectId,
      submissionId,
      activeStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const result = await handleGetIntakeSubmissionRequest(
      "Bearer token",
      projectId,
      submissionId,
      nonStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed submission id", async () => {
    const result = await handleGetIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      "not-a-uuid",
      activeStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(400);
  });

  it("returns 404 for a wrong-project submission binding", async () => {
    const result = await handleGetIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      activeStaffAuth,
      createFakeStaffGateway({ getIntakeSubmissionById: async () => null }),
    );
    expect(result.status).toBe(404);
  });

  it("returns 200 with the snapshot-mapped record", async () => {
    const result = await handleGetIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      activeStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: existingSubmission });
  });
});

describe("handleApplyIntakeSubmissionRequest", () => {
  it("returns 401 without an Authorization header", async () => {
    const result = await handleApplyIntakeSubmissionRequest(
      null,
      projectId,
      submissionId,
      activeStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const result = await handleApplyIntakeSubmissionRequest(
      "Bearer token",
      projectId,
      submissionId,
      nonStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(403);
  });

  it("passes exactly project id and submission id to the gateway", async () => {
    let capturedArgs: unknown;
    await handleApplyIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      activeStaffAuth,
      createFakeStaffGateway({
        applyIntakeSubmission: async (_client, pid, sid) => {
          capturedArgs = [pid, sid];
          return {
            id: sid,
            projectId: pid,
            status: "APPLIED",
            reviewedBy: "staff-1",
            reviewedAt: "2026-09-19T00:00:00.000Z",
            weddingDetailsChanged: true,
          };
        },
      }),
    );
    expect(capturedArgs).toEqual([projectId, submissionId]);
  });

  it.each([
    ["IS003", 404],
    ["IS007", 404],
    ["IS008", 409],
    ["IS001", 403],
  ])("maps a %s gateway error to HTTP %d", async (code, status) => {
    const kindMap: Record<string, ApplyIntakeSubmissionResult["status"] | string> = {
      IS003: "NOT_FOUND",
      IS007: "NOT_FOUND",
      IS008: "CONFLICT",
      IS001: "FORBIDDEN",
    };
    const result = await handleApplyIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      activeStaffAuth,
      createFakeStaffGateway({
        applyIntakeSubmission: async () => {
          throw new ApiError(kindMap[code] as ApiError["kind"], "mapped");
        },
      }),
    );
    expect(result.status).toBe(status);
  });

  it("maps a propagated WD004 to HTTP 422", async () => {
    const result = await handleApplyIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      activeStaffAuth,
      createFakeStaffGateway({
        applyIntakeSubmission: async () => {
          throw new ApiError("INVARIANT", "Gift QR media reference must belong to the same Project");
        },
      }),
    );
    expect(result.status).toBe(422);
  });

  it("maps an unrecognized failure to HTTP 500", async () => {
    const result = await handleApplyIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      activeStaffAuth,
      createFakeStaffGateway({
        applyIntakeSubmission: async () => {
          throw new Error("raw detail");
        },
      }),
    );
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });

  it("returns 200 with a narrow DTO on success", async () => {
    const result = await handleApplyIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      activeStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      id: submissionId,
      projectId,
      status: "APPLIED",
      reviewedBy: "staff-1",
      reviewedAt: "2026-09-19T00:00:00.000Z",
      weddingDetailsChanged: true,
    });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });
});

describe("handleRejectIntakeSubmissionRequest", () => {
  it("returns 401 without an Authorization header WITHOUT reading the body", async () => {
    let bodyRead = false;
    const result = await handleRejectIntakeSubmissionRequest(
      null,
      projectId,
      submissionId,
      bodyReader({}, () => {
        bodyRead = true;
      }),
      activeStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(401);
    expect(bodyRead).toBe(false);
  });

  it("returns 403 for an authenticated non-staff user WITHOUT reading the body", async () => {
    let bodyRead = false;
    const result = await handleRejectIntakeSubmissionRequest(
      "Bearer token",
      projectId,
      submissionId,
      bodyReader({}, () => {
        bodyRead = true;
      }),
      nonStaffAuth,
      createFakeStaffGateway(),
    );
    expect(result.status).toBe(403);
    expect(bodyRead).toBe(false);
  });

  it("returns 400 for a body-reader failure (e.g. malformed JSON) for an active staff caller", async () => {
    let called = false;
    const result = await handleRejectIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      throwingBodyReader(),
      activeStaffAuth,
      createFakeStaffGateway({
        rejectIntakeSubmission: async () => {
          called = true;
          throw new Error("should not be called");
        },
      }),
    );
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ error: "Request body must be valid JSON" });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
    expect(called).toBe(false);
  });

  it("reads the body only after requireStaff has already succeeded", async () => {
    let staffAuthCalled = false;
    const observingAuth: StaffAuthGateway<FakeClient> = {
      ...activeStaffAuth,
      async getActiveStaffProfile(client, userId) {
        staffAuthCalled = true;
        return activeStaffAuth.getActiveStaffProfile(client, userId);
      },
    };
    let bodyReadAfterAuth: boolean | undefined;

    await handleRejectIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      bodyReader({}, () => {
        bodyReadAfterAuth = staffAuthCalled;
      }),
      observingAuth,
      createFakeStaffGateway(),
    );

    expect(bodyReadAfterAuth).toBe(true);
  });

  it("returns 400 for an unknown body field, without calling the gateway", async () => {
    let called = false;
    const result = await handleRejectIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      bodyReader({ groomName: "nope" }),
      activeStaffAuth,
      createFakeStaffGateway({
        rejectIntakeSubmission: async () => {
          called = true;
          throw new Error("should not be called");
        },
      }),
    );
    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });

  it("accepts an omitted staffNote (null contract)", async () => {
    let capturedStaffNote: string | null | undefined;
    const result = await handleRejectIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      bodyReader({}),
      activeStaffAuth,
      createFakeStaffGateway({
        rejectIntakeSubmission: async (_client, pid, sid, staffNote) => {
          capturedStaffNote = staffNote;
          return {
            id: sid,
            projectId: pid,
            status: "REJECTED",
            reviewedBy: "staff-1",
            reviewedAt: "2026-09-19T00:00:00.000Z",
            staffNote,
          };
        },
      }),
    );
    expect(capturedStaffNote).toBeNull();
    expect(result.status).toBe(200);
  });

  it.each([
    ["IS003", 404],
    ["IS007", 404],
    ["IS008", 409],
    ["IS001", 403],
  ])("maps a %s gateway error to HTTP %d", async (code, status) => {
    const kindMap: Record<string, string> = {
      IS003: "NOT_FOUND",
      IS007: "NOT_FOUND",
      IS008: "CONFLICT",
      IS001: "FORBIDDEN",
    };
    const result = await handleRejectIntakeSubmissionRequest(
      "Bearer good-token",
      projectId,
      submissionId,
      bodyReader({}),
      activeStaffAuth,
      createFakeStaffGateway({
        rejectIntakeSubmission: async () => {
          throw new ApiError(kindMap[code] as ApiError["kind"], "mapped");
        },
      }),
    );
    expect(result.status).toBe(status);
  });

  it("returns 200 with a narrow DTO on success, never mutating Wedding Details", async () => {
    const result: { status: number; body: RejectIntakeSubmissionResult | { error: string } } =
      await handleRejectIntakeSubmissionRequest(
        "Bearer good-token",
        projectId,
        submissionId,
        bodyReader({ staffNote: "Please resubmit" }),
        activeStaffAuth,
        createFakeStaffGateway(),
      );
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      id: submissionId,
      projectId,
      status: "REJECTED",
      reviewedBy: "staff-1",
      reviewedAt: "2026-09-19T00:00:00.000Z",
      staffNote: "Please resubmit",
    });
    expect(JSON.stringify(result.body)).not.toMatch(/weddingDetails|groomName/);
  });
});
