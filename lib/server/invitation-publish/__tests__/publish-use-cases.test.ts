import { describe, expect, it, vi } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { evaluateProjectReviewState } from "../../invitation-review/get-project-review-state";
import type { ProjectInvitationRecord, ReviewFeedbackSummary, ReviewVersionSummary } from "../../invitation-review/invitation-review-types";
import type { ProjectSummary } from "../../projects/project-types";
import { evaluateProjectPublishState, getProjectPublishState, projectPublishBlocker } from "../get-project-publish-state";
import type { PublishInvitationParams, PublishedInvitationVersion, PublishedVersionSummary } from "../invitation-publish-types";
import { parsePublishInvitationCommand, publishInvitation } from "../publish-invitation";
import { mapPublishRpcError, PublishConflictError } from "../publish-rpc-error-codes";

/**
 * Task 031 publish use cases: strict browser command (CAS tokens only),
 * no draft/Snapshot path, result re-check, RPC error contract, and the
 * per-variant publish-eligibility read model (COMMON / SEPARATE, payment
 * and lifecycle blockers, aggregate publication).
 */

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const REVIEW_1 = "f0000000-0000-4000-8000-000000000001";
const REVIEW_2 = "f0000000-0000-4000-8000-000000000002";
const BRIDE_REVIEW = "f0000000-0000-4000-8000-000000000003";
const PUBLISHED_1 = "e0000000-0000-4000-8000-000000000001";
const GROOM_INV = "a0000000-0000-4000-8000-000000000001";
const BRIDE_INV = "a0000000-0000-4000-8000-000000000002";
const COMMON_INV = "a0000000-0000-4000-8000-000000000003";
const stamp = "2026-10-01T00:00:00.000Z";

const staff: StaffContext<string> = { userId: "u", role: "STAFF", displayName: "Staff", supabase: "staff-client" };

function published(overrides: Partial<PublishedInvitationVersion> = {}): PublishedInvitationVersion {
  return {
    id: PUBLISHED_1,
    invitationId: GROOM_INV,
    projectId: PROJECT_ID,
    variant: "GROOM",
    versionNumber: 2,
    sourceReviewVersionId: REVIEW_1,
    templateVersionId: "b0000000-0000-4000-8000-000000000001",
    rendererKeySnapshot: "wedding.elegant-editorial.v1",
    publishedAt: stamp,
    previousPublishedVersionId: null,
    projectStatus: "READY_TO_PUBLISH",
    ...overrides,
  };
}

describe("parsePublishInvitationCommand (browser cannot inject authority)", () => {
  const valid = { variant: "GROOM", expectedCurrentReviewVersionId: REVIEW_1, expectedPublishedVersionId: null };

  it("accepts exactly variant + the two CAS tokens", () => {
    expect(parsePublishInvitationCommand(valid)).toEqual(valid);
    expect(parsePublishInvitationCommand({ ...valid, expectedPublishedVersionId: PUBLISHED_1 }).expectedPublishedVersionId).toBe(PUBLISHED_1);
  });

  it.each(["payload", "snapshot", "rendererKey", "templateVersionId", "versionNumber", "mediaIds", "status", "targetStatus", "projectId"])(
    "rejects injected %s",
    (key) => {
      expect(() => parsePublishInvitationCommand({ ...valid, [key]: "x" })).toThrow(ApiError);
    },
  );

  it("rejects a missing/null review token, a bad variant and a malformed published token", () => {
    expect(() => parsePublishInvitationCommand({ ...valid, expectedCurrentReviewVersionId: null })).toThrow(/expectedCurrentReviewVersionId/);
    expect(() => parsePublishInvitationCommand({ ...valid, variant: "BOTH" })).toThrow(/variant/);
    expect(() => parsePublishInvitationCommand({ ...valid, expectedPublishedVersionId: "nope" })).toThrow(/expectedPublishedVersionId/);
    expect(() => parsePublishInvitationCommand([valid])).toThrow(/JSON object/);
  });
});

describe("publishInvitation", () => {
  it("sends only project + command to the RPC (no draft load, no Snapshot, no media) and returns the created version", async () => {
    const calls: [string, PublishInvitationParams][] = [];
    const deps = {
      publications: {
        publishInvitation: async (client: string, params: PublishInvitationParams) => {
          calls.push([client, params]);
          return published();
        },
      },
    };
    const result = await publishInvitation(
      PROJECT_ID,
      { variant: "GROOM", expectedCurrentReviewVersionId: REVIEW_1, expectedPublishedVersionId: null },
      staff,
      deps,
    );
    expect(result.sourceReviewVersionId).toBe(REVIEW_1);
    expect(calls).toEqual([
      ["staff-client", { projectId: PROJECT_ID, variant: "GROOM", expectedCurrentReviewVersionId: REVIEW_1, expectedPublishedVersionId: null }],
    ]);
    expect(Object.keys(calls[0][1]).sort()).toEqual(["expectedCurrentReviewVersionId", "expectedPublishedVersionId", "projectId", "variant"]);
  });

  it("a result not sourced from the expected review (or wrong variant/previous pointer) is a server fault, never success", async () => {
    const command = { variant: "GROOM", expectedCurrentReviewVersionId: REVIEW_1, expectedPublishedVersionId: null };
    for (const bad of [
      published({ sourceReviewVersionId: REVIEW_2 }),
      published({ variant: "BRIDE" }),
      published({ previousPublishedVersionId: PUBLISHED_1 }),
    ]) {
      await expect(publishInvitation(PROJECT_ID, command, staff, { publications: { publishInvitation: async () => bad } })).rejects.toThrow(
        /does not match/,
      );
    }
  });

  it("a malformed project id or body never reaches the RPC; RPC conflicts propagate unchanged", async () => {
    const rpc = vi.fn(async () => published());
    await expect(publishInvitation("x", {}, staff, { publications: { publishInvitation: rpc } })).rejects.toThrow(/UUID/);
    await expect(publishInvitation(PROJECT_ID, { variant: "GROOM" }, staff, { publications: { publishInvitation: rpc } })).rejects.toThrow(ApiError);
    expect(rpc).not.toHaveBeenCalled();

    const stale = vi.fn(async () => mapPublishRpcError("PB010"));
    await expect(
      publishInvitation(
        PROJECT_ID,
        { variant: "GROOM", expectedCurrentReviewVersionId: REVIEW_1, expectedPublishedVersionId: null },
        staff,
        { publications: { publishInvitation: stale } },
      ),
    ).rejects.toMatchObject({ kind: "CONFLICT", reason: "STALE_PUBLISHED_VERSION" });
  });
});

describe("mapPublishRpcError (0038 SQLSTATE contract)", () => {
  it.each([
    ["PB005", "LIFECYCLE_NOT_READY"],
    ["PB006", "PAYMENT_NOT_READY"],
    ["PB007", "PROJECT_CLOSED"],
    ["PB008", "NOT_APPROVED"],
    ["PB009", "STALE_REVIEW"],
    ["PB010", "STALE_PUBLISHED_VERSION"],
    ["PB011", "NOT_APPROVED"],
    ["PB012", "ALREADY_PUBLISHED"],
  ])("%s → 409 %s", (code, reason) => {
    expect(() => mapPublishRpcError(code)).toThrow(PublishConflictError);
    try {
      mapPublishRpcError(code);
    } catch (error) {
      expect(error).toMatchObject({ kind: "CONFLICT", reason });
    }
  });

  it("PB001 FORBIDDEN, PB002 NOT_FOUND, PB003/PB004 INVARIANT; PB013 and unknown codes are generic failures", () => {
    expect(() => mapPublishRpcError("PB001")).toThrow(expect.objectContaining({ kind: "FORBIDDEN" }));
    expect(() => mapPublishRpcError("PB002")).toThrow(expect.objectContaining({ kind: "NOT_FOUND" }));
    expect(() => mapPublishRpcError("PB003")).toThrow(expect.objectContaining({ kind: "INVARIANT" }));
    for (const code of ["PB013", "23505", "XX000"]) {
      try {
        mapPublishRpcError(code);
      } catch (error) {
        expect(error).not.toBeInstanceOf(ApiError);
      }
    }
  });
});

function reviewRow(id: string, invitationId: string, versionNumber: number): ReviewVersionSummary {
  return {
    id,
    invitationId,
    projectId: PROJECT_ID,
    versionNumber,
    templateVersionId: "b0000000-0000-4000-8000-000000000001",
    rendererKeySnapshot: "wedding.elegant-editorial.v1",
    createdAt: stamp,
  };
}

function approval(versionId: string, type: ReviewFeedbackSummary["feedbackType"] = "APPROVAL"): ReviewFeedbackSummary {
  return { id: `${versionId}-${type}`, invitationVersionId: versionId, feedbackType: type, message: null, createdAt: stamp };
}

function publishedRow(id: string, invitationId: string, source: string, versionNumber: number): PublishedVersionSummary {
  return { ...reviewRow(id, invitationId, versionNumber), sourceReviewVersionId: source, publishedAt: stamp };
}

function evaluate(input: {
  packageCode: string;
  status: ProjectSummary["status"];
  paymentStatus: ProjectSummary["paymentStatus"];
  invitations: ProjectInvitationRecord[];
  reviews: ReviewVersionSummary[];
  feedback: ReviewFeedbackSummary[];
  publishedVersions?: PublishedVersionSummary[];
}) {
  const review = evaluateProjectReviewState({
    projectId: PROJECT_ID,
    projectStatus: input.status,
    packageCode: input.packageCode,
    invitations: input.invitations,
    currentReviews: input.reviews,
    feedback: input.feedback,
  });
  return evaluateProjectPublishState({
    review,
    paymentStatus: input.paymentStatus,
    invitations: input.invitations,
    publishedVersions: input.publishedVersions ?? [],
    sourceReviews: input.reviews,
  });
}

function inv(id: string, variant: ProjectInvitationRecord["variant"], current: string | null, publishedId: string | null = null): ProjectInvitationRecord {
  return { id, projectId: PROJECT_ID, variant, currentReviewVersionId: current, publishedVersionId: publishedId };
}

describe("evaluateProjectPublishState (per-variant eligibility, aggregate publication)", () => {
  it("project blocker order mirrors 0038: closed → payment → lifecycle", () => {
    expect(projectPublishBlocker("PUBLISHED", "PAID")).toBe("PROJECT_CLOSED");
    expect(projectPublishBlocker("ARCHIVED", "UNPAID")).toBe("PROJECT_CLOSED");
    expect(projectPublishBlocker("APPROVED", "UNPAID")).toBe("PAYMENT_NOT_READY");
    expect(projectPublishBlocker("AWAITING_PAYMENT", "PAID")).toBe("LIFECYCLE_NOT_READY");
    expect(projectPublishBlocker("READY_TO_PUBLISH", "PAID")).toBeNull();
  });

  it("COMMON approved + READY_TO_PUBLISH + PAID is publishable; approval alone never bypasses payment", () => {
    const base = {
      packageCode: "COMMON",
      invitations: [inv(COMMON_INV, "COMMON", REVIEW_1)],
      reviews: [reviewRow(REVIEW_1, COMMON_INV, 1)],
      feedback: [approval(REVIEW_1)],
    };
    const ready = evaluate({ ...base, status: "READY_TO_PUBLISH", paymentStatus: "PAID" });
    expect(ready.variants[0]).toMatchObject({ variant: "COMMON", canPublish: true, blocker: null, publishedVersion: null });
    expect(ready.allRequiredVariantsPublished).toBe(false);

    const unpaid = evaluate({ ...base, status: "APPROVED", paymentStatus: "UNPAID" });
    expect(unpaid.projectBlocker).toBe("PAYMENT_NOT_READY");
    expect(unpaid.variants[0]).toMatchObject({ canPublish: false, blocker: "PAYMENT_NOT_READY" });
  });

  it("no review, unapproved and revision-requested reviews are not publishable", () => {
    const common = (current: string | null, feedback: ReviewFeedbackSummary[]) =>
      evaluate({
        packageCode: "COMMON",
        status: "READY_TO_PUBLISH",
        paymentStatus: "PAID",
        invitations: [inv(COMMON_INV, "COMMON", current)],
        reviews: current === null ? [] : [reviewRow(current, COMMON_INV, 1)],
        feedback,
      }).variants[0];
    expect(common(null, [])).toMatchObject({ canPublish: false, blocker: "NO_REVIEW" });
    expect(common(REVIEW_1, [])).toMatchObject({ canPublish: false, blocker: "NOT_APPROVED" });
    expect(common(REVIEW_1, [approval(REVIEW_1, "REVISION_REQUEST")])).toMatchObject({ canPublish: false, blocker: "REVISION_REQUESTED" });
  });

  it("COMMON published from its current review is up to date, aggregate published, and cannot be published twice", () => {
    const state = evaluate({
      packageCode: "COMMON",
      status: "PUBLISHED",
      paymentStatus: "PAID",
      invitations: [inv(COMMON_INV, "COMMON", REVIEW_1, PUBLISHED_1)],
      reviews: [reviewRow(REVIEW_1, COMMON_INV, 1)],
      feedback: [approval(REVIEW_1)],
      publishedVersions: [publishedRow(PUBLISHED_1, COMMON_INV, REVIEW_1, 2)],
    });
    expect(state.allRequiredVariantsPublished).toBe(true);
    expect(state.variants[0]).toMatchObject({ upToDate: true, canPublish: false });
    expect(state.variants[0].publishedVersion).toMatchObject({ versionNumber: 2, sourceReviewVersionNumber: 1 });
  });

  it("SEPARATE: one published side is not aggregate published; the other side stays publishable; an obsolete COMMON row is ignored", () => {
    const state = evaluate({
      packageCode: "SEPARATE",
      status: "READY_TO_PUBLISH",
      paymentStatus: "PAID",
      invitations: [
        inv(GROOM_INV, "GROOM", REVIEW_1, PUBLISHED_1),
        inv(BRIDE_INV, "BRIDE", BRIDE_REVIEW),
        inv(COMMON_INV, "COMMON", null, "e0000000-0000-4000-8000-0000000000ff"),
      ],
      reviews: [reviewRow(REVIEW_1, GROOM_INV, 1), reviewRow(BRIDE_REVIEW, BRIDE_INV, 1)],
      feedback: [approval(REVIEW_1), approval(BRIDE_REVIEW)],
      publishedVersions: [publishedRow(PUBLISHED_1, GROOM_INV, REVIEW_1, 2)],
    });
    expect(state.requiredVariants).toEqual(["GROOM", "BRIDE"]);
    expect(state.variants.map((row) => row.variant)).toEqual(["GROOM", "BRIDE"]);
    expect(state.allRequiredVariantsPublished).toBe(false);
    expect(state.variants[0]).toMatchObject({ upToDate: true, blocker: "ALREADY_PUBLISHED" });
    expect(state.variants[1]).toMatchObject({ canPublish: true, publishedVersion: null });
  });

  it("SEPARATE: a newer approved review after publication is publishable again (republish), old publication still shown", () => {
    const state = evaluate({
      packageCode: "SEPARATE",
      status: "READY_TO_PUBLISH",
      paymentStatus: "PAID",
      invitations: [inv(GROOM_INV, "GROOM", REVIEW_2, PUBLISHED_1), inv(BRIDE_INV, "BRIDE", BRIDE_REVIEW)],
      reviews: [reviewRow(REVIEW_2, GROOM_INV, 3), reviewRow(REVIEW_1, GROOM_INV, 1), reviewRow(BRIDE_REVIEW, BRIDE_INV, 1)],
      feedback: [approval(REVIEW_2), approval(BRIDE_REVIEW)],
      publishedVersions: [publishedRow(PUBLISHED_1, GROOM_INV, REVIEW_1, 2)],
    });
    expect(state.variants[0]).toMatchObject({ upToDate: false, canPublish: true });
    expect(state.variants[0].publishedVersion).toMatchObject({ id: PUBLISHED_1, sourceReviewVersionNumber: 1 });
  });

  it("SEPARATE: approving only one side is NOT_APPROVED for the approved side too (aggregate outcome must be APPROVED)", () => {
    const state = evaluate({
      packageCode: "SEPARATE",
      status: "READY_TO_PUBLISH",
      paymentStatus: "PAID",
      invitations: [inv(GROOM_INV, "GROOM", REVIEW_1), inv(BRIDE_INV, "BRIDE", BRIDE_REVIEW)],
      reviews: [reviewRow(REVIEW_1, GROOM_INV, 1), reviewRow(BRIDE_REVIEW, BRIDE_INV, 1)],
      feedback: [approval(REVIEW_1)],
    });
    expect(state.variants.map((row) => row.blocker)).toEqual(["NOT_APPROVED", "NOT_APPROVED"]);
  });

  it("a published pointer that cannot be loaded is an error, never an empty state", () => {
    expect(() =>
      evaluate({
        packageCode: "COMMON",
        status: "READY_TO_PUBLISH",
        paymentStatus: "PAID",
        invitations: [inv(COMMON_INV, "COMMON", REVIEW_1, PUBLISHED_1)],
        reviews: [reviewRow(REVIEW_1, COMMON_INV, 1)],
        feedback: [approval(REVIEW_1)],
      }),
    ).toThrow(/Published version/);
  });
});

describe("getProjectPublishState", () => {
  it("reads project/invitations/versions/feedback via staff RLS reads only and resolves the source review number", async () => {
    const project = { id: PROJECT_ID, status: "READY_TO_PUBLISH", paymentStatus: "PAID", packageCodeSnapshot: "COMMON" } as ProjectSummary;
    const listReviewVersionsByIds = vi.fn(async (_c: string, _p: string, ids: readonly string[]) =>
      ids.map((id) => reviewRow(id, COMMON_INV, id === REVIEW_1 ? 1 : 3)),
    );
    const state = await getProjectPublishState(PROJECT_ID, staff, {
      projects: { getProjectById: async () => project },
      reviews: {
        listProjectInvitations: async () => [inv(COMMON_INV, "COMMON", REVIEW_2, PUBLISHED_1)],
        listReviewVersionsByIds,
        listFeedbackForVersions: async () => [approval(REVIEW_2)],
      },
      publications: { listPublishedVersionsByIds: async () => [publishedRow(PUBLISHED_1, COMMON_INV, REVIEW_1, 2)] },
    });
    expect(listReviewVersionsByIds.mock.calls[0][2]).toEqual([REVIEW_2, REVIEW_1]);
    expect(state.variants[0]).toMatchObject({ canPublish: true, publishedVersion: { sourceReviewVersionNumber: 1 } });
  });

  it("missing Project is NOT_FOUND; malformed id is BAD_REQUEST", async () => {
    const deps = {
      projects: { getProjectById: async () => null },
      reviews: { listProjectInvitations: vi.fn(), listReviewVersionsByIds: vi.fn(), listFeedbackForVersions: vi.fn() },
      publications: { listPublishedVersionsByIds: vi.fn() },
    };
    await expect(getProjectPublishState(PROJECT_ID, staff, deps)).rejects.toMatchObject({ kind: "NOT_FOUND" });
    await expect(getProjectPublishState("x", staff, deps)).rejects.toMatchObject({ kind: "BAD_REQUEST" });
  });
});
