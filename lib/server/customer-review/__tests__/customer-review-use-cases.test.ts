import { describe, expect, it } from "vitest";

import { buildRendererFixture } from "../../../../templates/core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_PROJECT_ID, FIXTURE_TEMPLATE_VERSION_ID } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import { PRODUCTION_COMPATIBILITY_REGISTRY } from "../../../../templates/core/production-renderer-manifests";
import { deriveReviewOutcome, reviewVersionStateOf } from "../../../domain";
import { extractSnapshotMediaRefs, type SnapshotPayloadV1 } from "../../../invitation-rendering";
import { generateAccessToken } from "../../auth/access-token-crypto";
import type { AccessLinkResolutionRepository, ResolvedAccessLinkRow } from "../../supabase/access-link-resolution-repository";
import type { CustomerReviewMediaSigner } from "../customer-review-gateway";
import { CustomerReviewConflictError, mapCustomerReviewRpcError } from "../customer-review-rpc-error-codes";
import type { CustomerReviewRecord, PinnedReviewMedia, SubmitReviewFeedbackParams } from "../customer-review-types";
import { loadCustomerReview } from "../load-customer-review";
import { parseReviewFeedbackBody, submitCustomerReviewFeedback } from "../submit-customer-review-feedback";

/**
 * Task 030B customer REVIEW use cases: Path B token first, persisted
 * REVIEW Snapshot only, pinned-media-only signing, strict feedback command.
 * Status transitions themselves are DB-owned (migration 0037) and were
 * exercised against the real migration chain; the TS mirror is tested here.
 */

const LINK_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "f0000000-0000-4000-8000-0000000000a1";
const INVITATION_ID = "a0000000-0000-4000-8000-0000000000a1";
const UNRELATED_MEDIA_ID = "c0000000-0000-4000-8000-0000000000ee";
const stamp = "2026-10-03T04:11:56.123456+00:00";
const { rawToken: token } = generateAccessToken();

function resolution(row: Partial<ResolvedAccessLinkRow> | null) {
  const calls: string[] = [];
  const repo: AccessLinkResolutionRepository = {
    async lookupByTokenHash() {
      calls.push("lookup");
      return row === null ? null : { id: LINK_ID, projectId: FIXTURE_PROJECT_ID, linkType: "REVIEW", expiresAt: null, revokedAt: null, ...row };
    },
    async touchLastUsedAt() {
      calls.push("touch");
    },
  };
  return { repo, calls };
}

async function groomSnapshot(): Promise<SnapshotPayloadV1> {
  return (await buildRendererFixture({ variant: "GROOM" })).snapshot;
}

function pinnedFor(snapshot: SnapshotPayloadV1): PinnedReviewMedia[] {
  return extractSnapshotMediaRefs(snapshot).map((id, index) => ({
    id,
    storageBucket: "project-media",
    storagePath: `${FIXTURE_PROJECT_ID}/${id}.jpg`,
    width: 800 + index,
    height: 600,
  }));
}

function record(snapshot: SnapshotPayloadV1, overrides: Partial<CustomerReviewRecord> = {}, media = pinnedFor(snapshot)): CustomerReviewRecord {
  return {
    projectId: FIXTURE_PROJECT_ID,
    projectStatus: "CUSTOMER_REVIEW",
    hasVariantPolicy: true,
    feedbackOpen: true,
    variants: [
      {
        variant: "GROOM",
        review: {
          id: VERSION_ID,
          invitationId: INVITATION_ID,
          versionNumber: 3,
          templateVersionId: FIXTURE_TEMPLATE_VERSION_ID,
          rendererKey: snapshot.template.rendererKey,
          createdAt: stamp,
          payload: snapshot,
          media,
          feedback: [{ id: "fb1", feedbackType: "COMMENT", message: "Đẹp", createdAt: stamp }],
        },
      },
      { variant: "BRIDE", review: null },
    ],
    ...overrides,
  };
}

function loadDeps(rec: CustomerReviewRecord, row: Partial<ResolvedAccessLinkRow> | null = {}) {
  const { repo, calls } = resolution(row);
  const gatewayCalls: unknown[] = [];
  const signed: { id: string; storagePath: string }[][] = [];
  const signMedia: CustomerReviewMediaSigner = async (media) => {
    signed.push([...media]);
    return new Map(media.map((item) => [item.id, `https://signed.test/${item.storagePath}?token=runtime`]));
  };
  return {
    calls,
    gatewayCalls,
    signed,
    deps: {
      resolution: repo,
      reviews: {
        async getCustomerReview(context: unknown) {
          gatewayCalls.push(context);
          return rec;
        },
      },
      signMedia,
      rendererRegistry: PRODUCTION_COMPATIBILITY_REGISTRY.compatibility,
    },
  };
}

describe("loadCustomerReview (customer REVIEW page)", () => {
  it("a valid REVIEW token resolves the exact CURRENT review from the persisted Snapshot with its pinned renderer", async () => {
    const snapshot = await groomSnapshot();
    const { deps, calls, gatewayCalls } = loadDeps(record(snapshot));
    const view = await loadCustomerReview(token, deps);
    expect(calls).toEqual(["lookup", "touch"]);
    expect(gatewayCalls).toEqual([{ projectId: FIXTURE_PROJECT_ID, accessLinkId: LINK_ID }]);
    const groom = view.variants[0].review!;
    expect(groom).toMatchObject({ id: VERSION_ID, versionNumber: 3, state: "AWAITING_FEEDBACK", rendererKey: snapshot.template.rendererKey });
    expect(groom.viewModel.variant).toBe("GROOM");
    expect(view.variants[1]).toEqual({ variant: "BRIDE", review: null });
  });

  it.each([
    ["malformed / unknown token", null, "NOT_FOUND"],
    ["wrong purpose (INTAKE)", { linkType: "INTAKE" as const }, "NOT_FOUND"],
    ["revoked", { revokedAt: stamp }, "REVOKED_TOKEN"],
    ["expired", { expiresAt: "2020-01-01T00:00:00Z" }, "EXPIRED_TOKEN"],
  ])("%s is rejected before any privileged review read or signing", async (_label, row, kind) => {
    const snapshot = await groomSnapshot();
    const { deps, gatewayCalls, signed } = loadDeps(record(snapshot), row);
    await expect(loadCustomerReview(row === null ? "x".repeat(10) : token, deps)).rejects.toMatchObject({ kind });
    expect(gatewayCalls).toEqual([]);
    expect(signed).toEqual([]);
  });

  it("signs ONLY media pinned to that exact version and referenced by its Snapshot; unrelated/foreign-bucket rows never", async () => {
    const snapshot = await groomSnapshot();
    const refs = extractSnapshotMediaRefs(snapshot);
    expect(refs.length).toBeGreaterThan(1);
    const pinned = pinnedFor(snapshot);
    // Drop one referenced id from the pin set, add an unreferenced pinned row and a foreign-bucket row.
    const [notPinned, foreignBucket, ...rest] = pinned;
    const media = [
      ...rest,
      { ...foreignBucket, storageBucket: "other-bucket" },
      { id: UNRELATED_MEDIA_ID, storageBucket: "project-media", storagePath: "p/unrelated.jpg", width: null, height: null },
    ];
    const { deps, signed } = loadDeps(record(snapshot, {}, media));
    const view = await loadCustomerReview(token, deps);
    expect(signed).toHaveLength(1);
    const signedIds = signed[0].map((item) => item.id).sort();
    expect(signedIds).toEqual(rest.map((row) => row.id).sort());
    expect(signedIds).not.toContain(UNRELATED_MEDIA_ID);
    expect(signedIds).not.toContain(notPinned.id);
    const vmJson = JSON.stringify(view.variants[0].review!.viewModel);
    expect(vmJson).not.toContain("unrelated.jpg");
    expect(vmJson).not.toContain(`${notPinned.id}.jpg`);
  });

  it("signed URLs are runtime-only: present in the ViewModel, never written back into the persisted payload", async () => {
    const snapshot = await groomSnapshot();
    const before = JSON.stringify(snapshot);
    const rec = record(snapshot);
    const { deps } = loadDeps(rec);
    const view = await loadCustomerReview(token, deps);
    expect(JSON.stringify(view.variants[0].review!.viewModel)).toContain("token=runtime");
    expect(JSON.stringify(rec.variants[0].review!.payload)).toBe(before);
    expect(before).not.toMatch(/signed|token=/);
  });

  it("a stored payload that disagrees with its version row is an integrity fault, never rendered", async () => {
    const snapshot = await groomSnapshot();
    const tampered = record(snapshot);
    tampered.variants[0].review!.rendererKey = "wedding.other.v9";
    await expect(loadCustomerReview(token, loadDeps(tampered).deps)).rejects.toThrow(/inconsistent/);
    const wrongVariant = record(snapshot);
    wrongVariant.variants[0] = { ...wrongVariant.variants[0], variant: "BRIDE" };
    await expect(loadCustomerReview(token, loadDeps(wrongVariant).deps)).rejects.toThrow(/inconsistent/);
  });

  it("a review record for another Project than the token is rejected", async () => {
    const snapshot = await groomSnapshot();
    const other = record(snapshot, { projectId: "99999999-9999-4999-8999-999999999999" });
    await expect(loadCustomerReview(token, loadDeps(other).deps)).rejects.toThrow(/different Project/);
  });
});

describe("submitCustomerReviewFeedback", () => {
  function submitDeps(row: Partial<ResolvedAccessLinkRow> | null = {}, error?: Error) {
    const { repo } = resolution(row);
    const sent: SubmitReviewFeedbackParams[] = [];
    let bodyReads = 0;
    return {
      sent,
      readBody: (value: unknown) => async () => {
        bodyReads += 1;
        return value;
      },
      bodyReads: () => bodyReads,
      deps: {
        resolution: repo,
        reviews: {
          async submitReviewFeedback(params: SubmitReviewFeedbackParams) {
            sent.push(params);
            if (error) throw error;
            return { id: "fb", invitationVersionId: params.invitationVersionId, feedbackType: params.feedbackType, createdAt: stamp, projectStatus: "APPROVED" as const };
          },
        },
      },
    };
  }

  it("binds project/link ids from the token only and forwards the canonical APPROVAL", async () => {
    const t = submitDeps();
    const result = await submitCustomerReviewFeedback(token, t.readBody({ invitationVersionId: VERSION_ID, feedbackType: "APPROVAL" }), t.deps);
    expect(t.sent).toEqual([{ projectId: FIXTURE_PROJECT_ID, accessLinkId: LINK_ID, invitationVersionId: VERSION_ID, feedbackType: "APPROVAL", message: null }]);
    expect(result.projectStatus).toBe("APPROVED");
  });

  it("REVISION_REQUEST and COMMENT carry a trimmed message", async () => {
    const t = submitDeps();
    await submitCustomerReviewFeedback(token, t.readBody({ invitationVersionId: VERSION_ID, feedbackType: "REVISION_REQUEST", message: "  Sửa giờ  " }), t.deps);
    await submitCustomerReviewFeedback(token, t.readBody({ invitationVersionId: VERSION_ID, feedbackType: "COMMENT", message: "Đẹp" }), t.deps);
    expect(t.sent.map((p) => [p.feedbackType, p.message])).toEqual([["REVISION_REQUEST", "Sửa giờ"], ["COMMENT", "Đẹp"]]);
  });

  it("an invalid/revoked token fails before the body is read or the RPC is called", async () => {
    const bad = submitDeps(null);
    await expect(submitCustomerReviewFeedback("short", bad.readBody({}), bad.deps)).rejects.toMatchObject({ kind: "NOT_FOUND" });
    const revoked = submitDeps({ revokedAt: stamp });
    await expect(submitCustomerReviewFeedback(token, revoked.readBody({}), revoked.deps)).rejects.toMatchObject({ kind: "REVOKED_TOKEN" });
    expect(bad.bodyReads() + revoked.bodyReads()).toBe(0);
    expect([...bad.sent, ...revoked.sent]).toEqual([]);
  });

  it.each([
    [{ invitationVersionId: VERSION_ID, feedbackType: "APPROVAL", projectId: FIXTURE_PROJECT_ID }],
    [{ invitationVersionId: VERSION_ID, feedbackType: "APPROVAL", status: "APPROVED" }],
    [{ invitationVersionId: "nope", feedbackType: "APPROVAL" }],
    [{ invitationVersionId: VERSION_ID, feedbackType: "PUBLISH" }],
    [{ invitationVersionId: VERSION_ID, feedbackType: "COMMENT", message: "   " }],
    [{ invitationVersionId: VERSION_ID, feedbackType: "REVISION_REQUEST" }],
    [{ invitationVersionId: VERSION_ID, feedbackType: "COMMENT", message: "a".repeat(2001) }],
    [[]],
  ])("rejects a non-canonical command %j as BAD_REQUEST", (body) => {
    expect(() => parseReviewFeedbackBody(body)).toThrow(expect.objectContaining({ kind: "BAD_REQUEST" }));
  });

  it("a stale/superseded version surfaces the RPC CONFLICT with its reason unchanged", async () => {
    const t = submitDeps({}, new CustomerReviewConflictError("superseded", "REVIEW_SUPERSEDED"));
    await expect(
      submitCustomerReviewFeedback(token, t.readBody({ invitationVersionId: VERSION_ID, feedbackType: "APPROVAL" }), t.deps),
    ).rejects.toMatchObject({ kind: "CONFLICT", reason: "REVIEW_SUPERSEDED" });
  });
});

describe("0037 RPC error mapping", () => {
  it.each([
    ["RV011", { kind: "NOT_FOUND" }],
    ["RV012", { kind: "REVOKED_TOKEN" }],
    ["RV013", { kind: "EXPIRED_TOKEN" }],
    ["RV014", { kind: "BAD_REQUEST" }],
    ["RV016", { kind: "CONFLICT", reason: "REVIEW_SUPERSEDED" }],
    ["RV017", { kind: "CONFLICT", reason: "REVIEW_CLOSED" }],
    ["RV018", { kind: "CONFLICT", reason: "ALREADY_DECIDED" }],
  ])("%s maps by SQLSTATE", (code, expected) => {
    expect(() => mapCustomerReviewRpcError(code, "x")).toThrow(expect.objectContaining(expected));
  });

  it("unknown SQLSTATEs (incl. 0016 backstops) are generic failures, never business errors", () => {
    for (const code of ["23505", "P0001", "42501"]) {
      expect(() => mapCustomerReviewRpcError(code, "generic")).toThrow(new Error("generic"));
    }
  });
});

describe("review outcome precedence (TS mirror of 0037 review_outcome_for_project)", () => {
  it("revision outranks approval; partial approval stays CUSTOMER_REVIEW; all approved is APPROVED", () => {
    expect(reviewVersionStateOf(["APPROVAL", "REVISION_REQUEST"])).toBe("REVISION_REQUESTED");
    expect(reviewVersionStateOf(["COMMENT"])).toBe("AWAITING_FEEDBACK");
    expect(deriveReviewOutcome(["APPROVED", "REVISION_REQUESTED"])).toBe("REVISION_REQUIRED");
    expect(deriveReviewOutcome(["APPROVED", null])).toBe("CUSTOMER_REVIEW");
    expect(deriveReviewOutcome(["APPROVED", "AWAITING_FEEDBACK"])).toBe("CUSTOMER_REVIEW");
    expect(deriveReviewOutcome(["APPROVED", "APPROVED"])).toBe("APPROVED");
    expect(deriveReviewOutcome([])).toBe("CUSTOMER_REVIEW");
  });
});
