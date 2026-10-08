import { describe, expect, it } from "vitest";

import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import { PRODUCTION_COMPATIBILITY_REGISTRY } from "../../../../templates/core/production-renderer-manifests";
import {
  buildRendererFixtureSourceInput,
  FIXTURE_PROJECT_ID,
  FIXTURE_TEMPLATE_VERSION_ID,
} from "../../../../templates/core/fixtures/renderer-fixture-sources";
import { extractSnapshotMediaRefs, type MediaResolution, type SnapshotPayloadV1 } from "../../../invitation-rendering";
import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectMediaRecord } from "../../media/media-types";
import type { ProjectDesignRecord } from "../../project-design/project-design-types";
import type { ProjectSummary } from "../../projects/project-types";
import type { WeddingDetailsRecord } from "../../wedding-details/wedding-details-types";
import { buildReviewVersionPreview } from "../build-review-version-preview";
import {
  assertSnapshotHasNoSignedUrls,
  createReviewVersion,
  type CreateReviewVersionDependencies,
} from "../create-review-version";
import { evaluateProjectReviewState, getProjectReviewState } from "../get-project-review-state";
import type {
  CreateReviewVersionParams,
  ProjectInvitationRecord,
  ReviewFeedbackSummary,
  ReviewVersionSummary,
} from "../invitation-review-types";

/**
 * Task 030 review use cases: server-built REVIEW Snapshot (same frozen
 * pipeline as Staff Preview), exact binding, fail-closed creation, strict
 * browser command, immutable-review preview and the variant-aware
 * required-approval read model.
 */

const stamp = "2026-10-01T00:00:00.000Z";
const fixtureSource = buildRendererFixtureSourceInput({ variant: "GROOM" });
const ROW_RENDERER_KEY = fixtureSource.templateVersion.rendererKey;
const coverId = "c0000000-0000-4000-8000-000000000001";
const socialId = "c0000000-0000-4000-8000-000000000009";
const VERSION_ID = "f0000000-0000-4000-8000-000000000001";
const NEXT_VERSION_ID = "f0000000-0000-4000-8000-000000000002";
const INVITATION_ID = "a0000000-0000-4000-8000-000000000001";

const staff: StaffContext<string> = { userId: "u", role: "STAFF", displayName: "Staff", supabase: "staff-client" };

const project: ProjectSummary = {
  id: FIXTURE_PROJECT_ID,
  projectCode: fixtureSource.project.projectCode,
  customer: { id: "c1", displayName: "Customer" },
  eventType: "WEDDING",
  status: "IN_PROGRESS",
  deadlineAt: null,
  assignedStaff: null,
  packageCodeSnapshot: "SEPARATE",
  packageNameSnapshot: "Separate",
  basePriceVnd: 0,
  addonTotalVnd: 0,
  totalPriceVnd: 0,
  paymentStatus: "UNPAID",
  createdAt: stamp,
  updatedAt: stamp,
  addons: [],
};

const weddingDetails: WeddingDetailsRecord = {
  ...(fixtureSource.weddingDetails as NonNullable<typeof fixtureSource.weddingDetails>),
  id: "d0000000-0000-4000-8000-000000000001",
  lunarDateDisplay: null,
  additionalNote: "internal note",
  createdAt: stamp,
  updatedAt: stamp,
};

const design: ProjectDesignRecord = { ...fixtureSource.design, id: "e0000000-0000-4000-8000-000000000001", createdAt: stamp, updatedAt: stamp };

function media(id: string, mediaType: ProjectMediaRecord["mediaType"]): ProjectMediaRecord {
  return {
    id,
    projectId: FIXTURE_PROJECT_ID,
    mediaType,
    storageBucket: "project-media",
    storagePath: `${FIXTURE_PROJECT_ID}/${id}`,
    mimeType: "image/jpeg",
    sizeBytes: 10,
    width: 800,
    height: 600,
    altText: null,
    sortOrder: 0,
    createdBy: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

interface Overrides {
  weddingDetails?: WeddingDetailsRecord | null;
  design?: ProjectDesignRecord | null;
  rendererKey?: string;
  rpcError?: Error;
  eventsError?: Error;
}

function setup(o: Overrides = {}) {
  const rpcCalls: { client: string; params: CreateReviewVersionParams }[] = [];
  const loads: string[] = [];
  const deps: CreateReviewVersionDependencies<string> = {
    projects: { getProjectById: async () => (loads.push("project"), project) },
    weddingDetails: { getWeddingDetailsByProjectId: async () => (loads.push("details"), "weddingDetails" in o ? o.weddingDetails! : weddingDetails) },
    events: {
      listProjectEvents: async () => {
        loads.push("events");
        if (o.eventsError) throw o.eventsError;
        return [...fixtureSource.events];
      },
    },
    design: { getCurrentProjectDesign: async () => ("design" in o ? o.design! : design) },
    templateVersions: {
      getTemplateVersionBinding: async () => ({ id: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: o.rendererKey ?? ROW_RENDERER_KEY }),
    },
    media: { listProjectMedia: async () => [media(coverId, "COVER"), media(socialId, "SOCIAL_SHARE_COVER")] },
    timeline: {
      listProjectTimelineItems: async () => [
        { id: "b0000000-0000-4000-8000-000000000001", projectId: FIXTURE_PROJECT_ID, time: "17:00", label: "Đón khách", sortOrder: 0, createdAt: stamp, updatedAt: stamp },
      ],
    },
    dressCode: { getProjectDressCode: async () => null },
    // TE-04: legacy (Elegant Editorial) inputs never read template slot rows.
    templateSlots: { listSlotItems: () => Promise.reject(new Error("LEGACY_ROLES must not read template slots")) },
    lookupEditorManifest: lookupTemplateEditorManifest,
    async createMediaResolver() {
      return {
        async resolveMedia(mediaId): Promise<MediaResolution> {
          return { status: "RESOLVED", mediaId, url: `https://signed.test/storage/v1/object/sign/${mediaId}?token=t`, width: 800, height: 600 };
        },
      };
    },
    rendererRegistry: PRODUCTION_COMPATIBILITY_REGISTRY.compatibility,
    reviews: {
      async createReviewVersion(client, params) {
        rpcCalls.push({ client, params });
        if (o.rpcError) throw o.rpcError;
        return {
          id: VERSION_ID,
          invitationId: INVITATION_ID,
          projectId: params.projectId,
          variant: params.variant,
          versionNumber: 1,
          templateVersionId: params.templateVersionId,
          rendererKeySnapshot: params.rendererKey,
          createdAt: stamp,
        };
      },
    },
  };
  return { deps, rpcCalls, loads };
}

const body = (variant = "GROOM", expected: string | null = null) => ({ variant, expectedCurrentReviewVersionId: expected });

describe("createReviewVersion", () => {
  it.each(["COMMON", "GROOM", "BRIDE"] as const)("persists a server-built %s REVIEW Snapshot with the exact pinned binding", async (variant) => {
    const { deps, rpcCalls } = setup();
    const result = await createReviewVersion(FIXTURE_PROJECT_ID, body(variant), staff, deps);
    expect(result.status).toBe("CREATED");
    expect(rpcCalls).toHaveLength(1);
    const { client, params } = rpcCalls[0];
    expect(client).toBe("staff-client");
    expect(params.variant).toBe(variant);
    expect(params.templateVersionId).toBe(FIXTURE_TEMPLATE_VERSION_ID);
    expect(params.rendererKey).toBe(ROW_RENDERER_KEY);
    const payload = params.payload as SnapshotPayloadV1;
    expect(payload.variant).toBe(variant);
    expect(payload.template).toEqual({ templateVersionId: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: ROW_RENDERER_KEY });
    expect(params.mediaIds).toEqual(extractSnapshotMediaRefs(payload));
  });

  it("stores canonical content and media ids but no signed URL, ViewModel or token", async () => {
    const { deps, rpcCalls } = setup();
    await createReviewVersion(FIXTURE_PROJECT_ID, body(), staff, deps);
    const payload = rpcCalls[0].params.payload as SnapshotPayloadV1;
    expect(payload.media.coverMediaId).toBe(coverId);
    expect(payload.families.groom.side).toBe("GROOM");
    expect(payload.content.timeline).toEqual([{ id: "b0000000-0000-4000-8000-000000000001", time: "17:00", label: "Đón khách" }]);
    expect(payload.content.dressCode).toBeNull();
    expect(payload).toHaveProperty("gift");
    const json = JSON.stringify(payload);
    expect(json).not.toContain("signed.test");
    expect(json).not.toContain("token=");
    expect(json).not.toContain("storagePath");
    expect(json).not.toContain("internal note");
    expect(payload).not.toHaveProperty("viewModel");
  });

  it("pins exactly the referenced media: unrelated SOCIAL_SHARE_COVER is neither in the Snapshot nor pinned", async () => {
    const { deps, rpcCalls } = setup();
    await createReviewVersion(FIXTURE_PROJECT_ID, body(), staff, deps);
    const { mediaIds, payload } = rpcCalls[0].params;
    expect(mediaIds).toContain(coverId);
    expect(mediaIds).toEqual(extractSnapshotMediaRefs(payload as SnapshotPayloadV1));
    expect(mediaIds).not.toContain(socialId);
    expect(JSON.stringify(rpcCalls[0].params.payload)).not.toContain(socialId);
  });

  it("passes the compare-and-set token through unchanged", async () => {
    const { deps, rpcCalls } = setup();
    await createReviewVersion(FIXTURE_PROJECT_ID, body("GROOM", VERSION_ID), staff, deps);
    expect(rpcCalls[0].params.expectedCurrentReviewVersionId).toBe(VERSION_ID);
  });

  it("BLOCKED canonical data returns the builder issues and writes nothing", async () => {
    const { deps, rpcCalls } = setup({ weddingDetails: null });
    const result = await createReviewVersion(FIXTURE_PROJECT_ID, body(), staff, deps);
    expect(result).toEqual({ status: "BLOCKED", issues: [expect.objectContaining({ code: "WEDDING_DETAILS_MISSING" })] });
    expect(rpcCalls).toHaveLength(0);
  });

  it("no design is CONFLICT and writes nothing", async () => {
    const { deps, rpcCalls } = setup({ design: null });
    await expect(createReviewVersion(FIXTURE_PROJECT_ID, body(), staff, deps)).rejects.toMatchObject({ kind: "CONFLICT" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("an unregistered renderer fails closed (INVARIANT) with no fallback and no write", async () => {
    const { deps, rpcCalls } = setup({ rendererKey: "wedding.not-registered.v9" });
    await expect(createReviewVersion(FIXTURE_PROJECT_ID, body(), staff, deps)).rejects.toMatchObject({ kind: "INVARIANT" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("an authoritative load failure propagates and writes nothing", async () => {
    const { deps, rpcCalls } = setup({ eventsError: new Error("db down") });
    await expect(createReviewVersion(FIXTURE_PROJECT_ID, body(), staff, deps)).rejects.toThrow("db down");
    expect(rpcCalls).toHaveLength(0);
  });

  it.each(["snapshot", "payload", "rendererKey", "templateVersionId", "mediaIds"])(
    "rejects a browser-supplied %s before any load or write",
    async (key) => {
      const { deps, rpcCalls, loads } = setup();
      await expect(createReviewVersion(FIXTURE_PROJECT_ID, { ...body(), [key]: "x" }, staff, deps)).rejects.toMatchObject({
        kind: "BAD_REQUEST",
      });
      expect(loads).toHaveLength(0);
      expect(rpcCalls).toHaveLength(0);
    },
  );

  it.each([
    ["bad variant", { variant: "ALL", expectedCurrentReviewVersionId: null }],
    ["missing CAS token", { variant: "GROOM" }],
    ["non-uuid CAS token", { variant: "GROOM", expectedCurrentReviewVersionId: "v1" }],
    ["non-object", []],
  ])("rejects %s as BAD_REQUEST", async (_label, raw) => {
    const { deps, rpcCalls } = setup();
    await expect(createReviewVersion(FIXTURE_PROJECT_ID, raw, staff, deps)).rejects.toMatchObject({ kind: "BAD_REQUEST" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("a stale/duplicate submit surfaces the RPC CONFLICT unchanged", async () => {
    const { deps } = setup({ rpcError: new ApiError("CONFLICT", "Current review version has changed; reload and try again") });
    await expect(createReviewVersion(FIXTURE_PROJECT_ID, body(), staff, deps)).rejects.toMatchObject({ kind: "CONFLICT" });
  });

  it("assertSnapshotHasNoSignedUrls rejects storage signing material", () => {
    const tainted = { media: { url: "https://x.supabase.co/storage/v1/object/sign/a" } } as unknown as SnapshotPayloadV1;
    expect(() => assertSnapshotHasNoSignedUrls(tainted)).toThrow();
  });
});

const review = (id: string, versionNumber: number, invitationId = INVITATION_ID): ReviewVersionSummary => ({
  id,
  invitationId,
  projectId: FIXTURE_PROJECT_ID,
  versionNumber,
  templateVersionId: FIXTURE_TEMPLATE_VERSION_ID,
  rendererKeySnapshot: ROW_RENDERER_KEY,
  createdAt: stamp,
});
const invitation = (variant: ProjectInvitationRecord["variant"], current: string | null, id = INVITATION_ID): ProjectInvitationRecord => ({
  id,
  projectId: FIXTURE_PROJECT_ID,
  variant,
  currentReviewVersionId: current,
  publishedVersionId: null,
});
const fb = (versionId: string, feedbackType: ReviewFeedbackSummary["feedbackType"]): ReviewFeedbackSummary => ({
  id: `${versionId}-${feedbackType}`,
  invitationVersionId: versionId,
  feedbackType,
  message: feedbackType === "APPROVAL" ? null : "Sửa giúp",
  createdAt: stamp,
});

describe("evaluateProjectReviewState (required-variant approval)", () => {
  const groomInv = "a0000000-0000-4000-8000-0000000000a1";
  const brideInv = "a0000000-0000-4000-8000-0000000000b1";
  const groomV = "f0000000-0000-4000-8000-0000000000a1";
  const brideV = "f0000000-0000-4000-8000-0000000000b1";
  const base = { projectId: FIXTURE_PROJECT_ID, projectStatus: "CUSTOMER_REVIEW" as const };

  it("COMMON package requires exactly COMMON; no invitation yet is unreviewed", () => {
    const state = evaluateProjectReviewState({ ...base, packageCode: "COMMON", invitations: [], currentReviews: [], feedback: [] });
    expect(state.requiredVariants).toEqual(["COMMON"]);
    expect(state.variants).toEqual([
      { variant: "COMMON", invitationId: null, currentReview: null, approved: false, revisionRequested: false },
    ]);
    expect(state.reviewOutcome).toBeNull();
    expect(state.allRequiredVariantsApproved).toBe(false);
  });

  it("an unknown package fails closed: no policy, never approved", () => {
    const state = evaluateProjectReviewState({ ...base, packageCode: "BASIC", invitations: [], currentReviews: [], feedback: [] });
    expect(state.requiredVariants).toBeNull();
    expect(state.allRequiredVariantsApproved).toBe(false);
  });

  it("SEPARATE: both variants approved on their own current review → all approved", () => {
    const state = evaluateProjectReviewState({
      ...base,
      packageCode: "SEPARATE",
      invitations: [invitation("GROOM", groomV, groomInv), invitation("BRIDE", brideV, brideInv)],
      currentReviews: [review(groomV, 2, groomInv), review(brideV, 1, brideInv)],
      feedback: [fb(groomV, "APPROVAL"), fb(brideV, "APPROVAL")],
    });
    expect(state.requiredVariants).toEqual(["GROOM", "BRIDE"]);
    expect(state.variants.map((v) => v.approved)).toEqual([true, true]);
    expect(state.allRequiredVariantsApproved).toBe(true);
    expect(state.reviewOutcome).toBe("APPROVED");
  });

  it("partial approval (one side not yet reviewed) is CUSTOMER_REVIEW, never APPROVED", () => {
    const state = evaluateProjectReviewState({
      ...base,
      packageCode: "SEPARATE",
      invitations: [invitation("GROOM", groomV, groomInv)],
      currentReviews: [review(groomV, 1, groomInv)],
      feedback: [fb(groomV, "APPROVAL")],
    });
    expect(state.variants.map((v) => v.approved)).toEqual([true, false]);
    expect(state.reviewOutcome).toBe("CUSTOMER_REVIEW");
  });

  it("a revision request outranks an approval on the same current version (owner precedence)", () => {
    const state = evaluateProjectReviewState({
      ...base,
      packageCode: "COMMON",
      invitations: [invitation("COMMON", VERSION_ID)],
      currentReviews: [review(VERSION_ID, 1)],
      feedback: [fb(VERSION_ID, "APPROVAL"), fb(VERSION_ID, "REVISION_REQUEST")],
    });
    expect(state.variants[0]).toMatchObject({ approved: false, revisionRequested: true });
    expect(state.variants[0].currentReview?.feedback.map((row) => row.message)).toEqual([null, "Sửa giúp"]);
    expect(state.reviewOutcome).toBe("REVISION_REQUIRED");
  });

  it("approval of an older review does not approve the newer current review", () => {
    const state = evaluateProjectReviewState({
      ...base,
      packageCode: "COMMON",
      invitations: [invitation("COMMON", NEXT_VERSION_ID)],
      currentReviews: [review(NEXT_VERSION_ID, 2)],
      feedback: [fb(VERSION_ID, "APPROVAL")],
    });
    expect(state.variants[0].approved).toBe(false);
    expect(state.variants[0].currentReview?.approvalState).toBe("AWAITING_FEEDBACK");
    expect(state.allRequiredVariantsApproved).toBe(false);
  });

  it("an approved COMMON invitation never approves SEPARATE's GROOM/BRIDE (extra row ignored)", () => {
    const state = evaluateProjectReviewState({
      ...base,
      packageCode: "SEPARATE",
      invitations: [invitation("COMMON", VERSION_ID)],
      currentReviews: [review(VERSION_ID, 1)],
      feedback: [fb(VERSION_ID, "APPROVAL")],
    });
    expect(state.variants.map((v) => [v.variant, v.approved])).toEqual([["GROOM", false], ["BRIDE", false]]);
    expect(state.allRequiredVariantsApproved).toBe(false);
  });

  it("one approved side and one revision request is not all-approved", () => {
    const state = evaluateProjectReviewState({
      ...base,
      packageCode: "SEPARATE",
      invitations: [invitation("GROOM", groomV, groomInv), invitation("BRIDE", brideV, brideInv)],
      currentReviews: [review(groomV, 1, groomInv), review(brideV, 1, brideInv)],
      feedback: [fb(groomV, "APPROVAL"), fb(brideV, "REVISION_REQUEST")],
    });
    expect(state.variants[1].currentReview?.approvalState).toBe("REVISION_REQUESTED");
    expect(state.allRequiredVariantsApproved).toBe(false);
    expect(state.reviewOutcome).toBe("REVISION_REQUIRED");
  });

  it("a current pointer whose version cannot be loaded is an error, never an empty state", () => {
    expect(() =>
      evaluateProjectReviewState({ ...base, packageCode: "COMMON", invitations: [invitation("COMMON", VERSION_ID)], currentReviews: [], feedback: [] }),
    ).toThrow();
  });
});

describe("getProjectReviewState", () => {
  function reviewDeps(projectRow: ProjectSummary | null) {
    const queried: string[] = [];
    return {
      queried,
      deps: {
        projects: { getProjectById: async () => projectRow },
        reviews: {
          listProjectInvitations: async () => (queried.push("invitations"), []),
          listReviewVersionsByIds: async () => (queried.push("versions"), []),
          listFeedbackForVersions: async () => (queried.push("feedback"), []),
        },
      },
    };
  }

  it("reads the package policy from the Project and skips version/feedback reads with no current reviews", async () => {
    const { deps, queried } = reviewDeps(project);
    const state = await getProjectReviewState(FIXTURE_PROJECT_ID, staff, deps);
    expect(state.requiredVariants).toEqual(["GROOM", "BRIDE"]);
    expect(state.projectStatus).toBe(project.status);
    expect(queried).toEqual(["invitations"]);
  });

  it("missing Project is NOT_FOUND; malformed id is BAD_REQUEST", async () => {
    await expect(getProjectReviewState(FIXTURE_PROJECT_ID, staff, reviewDeps(null).deps)).rejects.toMatchObject({ kind: "NOT_FOUND" });
    await expect(getProjectReviewState("nope", staff, reviewDeps(project).deps)).rejects.toMatchObject({ kind: "BAD_REQUEST" });
  });
});

describe("buildReviewVersionPreview (immutable REVIEW render)", () => {
  async function storedSnapshot(): Promise<SnapshotPayloadV1> {
    const { deps, rpcCalls } = setup();
    await createReviewVersion(FIXTURE_PROJECT_ID, body("BRIDE"), staff, deps);
    return rpcCalls[0].params.payload as SnapshotPayloadV1;
  }

  function previewDeps(payload: unknown, variant: "COMMON" | "GROOM" | "BRIDE" = "BRIDE") {
    const { deps } = setup();
    return {
      createMediaResolver: deps.createMediaResolver,
      rendererRegistry: deps.rendererRegistry,
      reviews: {
        getReviewVersionWithPayload: async (_c: string, projectId: string, versionId: string) =>
          versionId === VERSION_ID ? { ...review(VERSION_ID, 3), projectId, variant, payload } : null,
      },
    };
  }

  it("renders only from the persisted Snapshot with its pinned renderer (no draft loaders exist here)", async () => {
    const payload = await storedSnapshot();
    const preview = await buildReviewVersionPreview(FIXTURE_PROJECT_ID, VERSION_ID, staff, previewDeps(payload));
    expect(preview.rendererKey).toBe(ROW_RENDERER_KEY);
    expect(preview.viewModel.variant).toBe("BRIDE");
    expect(preview.version.versionNumber).toBe(3);
  });

  it("a stored payload that disagrees with its row is an integrity fault, not a degraded render", async () => {
    const payload = await storedSnapshot();
    await expect(buildReviewVersionPreview(FIXTURE_PROJECT_ID, VERSION_ID, staff, previewDeps(payload, "GROOM"))).rejects.toThrow();
  });

  it("an unknown version is NOT_FOUND", async () => {
    await expect(
      buildReviewVersionPreview(FIXTURE_PROJECT_ID, NEXT_VERSION_ID, staff, previewDeps({})),
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });
});
