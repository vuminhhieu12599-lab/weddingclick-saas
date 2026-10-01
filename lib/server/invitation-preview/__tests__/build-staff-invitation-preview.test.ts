import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PRODUCTION_COMPATIBILITY_REGISTRY } from "../../../../templates/core/production-renderer-manifests";
import {
  buildRendererFixtureSourceInput,
  FIXTURE_MEDIA_IDS,
  FIXTURE_PROJECT_ID,
  FIXTURE_TEMPLATE_VERSION_ID,
} from "../../../../templates/core/fixtures/renderer-fixture-sources";
import {
  extractSnapshotMediaRefs,
  RendererSelectionError,
  SnapshotPayloadInvariantError,
  type MediaResolution,
} from "../../../invitation-rendering";
import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectMediaRecord } from "../../media/media-types";
import type { ProjectDesignRecord } from "../../project-design/project-design-types";
import type { ProjectDressCodeWithSwatches } from "../../project-dress-code/project-dress-code-gateway";
import type { ProjectEventRecord } from "../../project-events/project-events-types";
import type { ProjectTimelineItemRecord } from "../../project-timeline/project-timeline-types";
import type { ProjectSummary } from "../../projects/project-types";
import type { WeddingDetailsRecord } from "../../wedding-details/wedding-details-types";
import {
  buildStaffInvitationPreview,
  StaffInvitationPreviewInvariantError,
  type StaffInvitationPreviewDependencies,
} from "../build-staff-invitation-preview";

const stamp = "2026-10-01T00:00:00.000Z";
const otherProjectId = "99999999-0000-4000-8000-000000000001";
const coverId = "c0000000-0000-4000-8000-000000000001";
const stepId = "c0000000-0000-4000-8000-000000000004";
const swatchId = "c0000000-0000-4000-8000-000000000003";
/** Read from the fixture template-version row, never typed in this test. */
const fixtureSource = buildRendererFixtureSourceInput({ variant: "GROOM" });
const ROW_RENDERER_KEY = fixtureSource.templateVersion.rendererKey;

const staff: StaffContext<string> = { userId: "u", role: "STAFF", displayName: "Staff", supabase: "staff-client" };

const project: ProjectSummary = {
  id: FIXTURE_PROJECT_ID,
  projectCode: fixtureSource.project.projectCode,
  customer: { id: "c1", displayName: "Customer" },
  eventType: "WEDDING",
  status: "IN_PROGRESS" as ProjectSummary["status"],
  deadlineAt: null,
  assignedStaff: null,
  packageCodeSnapshot: "BASIC",
  packageNameSnapshot: "Basic",
  basePriceVnd: 0,
  addonTotalVnd: 0,
  totalPriceVnd: 0,
  paymentStatus: "UNPAID" as ProjectSummary["paymentStatus"],
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

const design: ProjectDesignRecord = {
  ...fixtureSource.design,
  id: "e0000000-0000-4000-8000-000000000001",
  createdAt: stamp,
  updatedAt: stamp,
};

function media(id: string, mediaType: ProjectMediaRecord["mediaType"], projectId = FIXTURE_PROJECT_ID): ProjectMediaRecord {
  return {
    id,
    projectId,
    mediaType,
    storageBucket: "project-media",
    storagePath: `${projectId}/${id}`,
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

type Source<T> = T | Error;

interface Sources {
  project?: Source<ProjectSummary | null>;
  weddingDetails?: Source<WeddingDetailsRecord | null>;
  events?: Source<ProjectEventRecord[]>;
  design?: Source<ProjectDesignRecord | null>;
  templateVersion?: Source<{ id: string; rendererKey: string } | null>;
  media?: Source<ProjectMediaRecord[]>;
  timeline?: Source<ProjectTimelineItemRecord[]>;
  dressCode?: Source<ProjectDressCodeWithSwatches | null>;
  resolver?: Error;
  unavailable?: readonly string[];
}

function setup(sources: Sources = {}) {
  const calls: unknown[][] = [];
  const settle = async <T>(value: Source<T>): Promise<T> => {
    if (value instanceof Error) throw value;
    return value;
  };
  const pick = <K extends keyof Sources>(key: K, fallback: Sources[K]): Sources[K] =>
    Object.prototype.hasOwnProperty.call(sources, key) ? sources[key] : fallback;

  const deps: StaffInvitationPreviewDependencies<string> = {
    projects: { getProjectById: (c, id) => (calls.push(["project", c, id]), settle(pick("project", project)!)) },
    weddingDetails: {
      getWeddingDetailsByProjectId: (c, id) => (calls.push(["weddingDetails", c, id]), settle(pick("weddingDetails", weddingDetails)!)),
    },
    events: { listProjectEvents: (c, id) => (calls.push(["events", c, id]), settle(pick("events", [...fixtureSource.events])!)) },
    design: { getCurrentProjectDesign: (c, id) => (calls.push(["design", c, id]), settle(pick("design", design)!)) },
    templateVersions: {
      getTemplateVersionBinding: (c, id) =>
        (calls.push(["templateVersion", c, id]),
        settle(pick("templateVersion", { id: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: ROW_RENDERER_KEY })!)),
    },
    media: { listProjectMedia: (c, id) => (calls.push(["media", c, id]), settle(pick("media", [media(coverId, "COVER")])!)) },
    timeline: { listProjectTimelineItems: (c, id) => (calls.push(["timeline", c, id]), settle(pick("timeline", [])!)) },
    dressCode: { getProjectDressCode: (c, id) => (calls.push(["dressCode", c, id]), settle(pick("dressCode", null)!)) },
    async createMediaResolver(c, projectId, mediaIds) {
      calls.push(["createMediaResolver", c, projectId, [...mediaIds]]);
      if (sources.resolver) throw sources.resolver;
      return {
        async resolveMedia(mediaId): Promise<MediaResolution> {
          return sources.unavailable?.includes(mediaId)
            ? { status: "UNAVAILABLE", mediaId }
            : { status: "RESOLVED", mediaId, url: `https://signed.test/${mediaId}?token=t`, width: 800, height: 600 };
        },
      };
    },
    rendererRegistry: PRODUCTION_COMPATIBILITY_REGISTRY.compatibility,
  };
  return { deps, calls };
}

async function ready(sources: Sources = {}, variant = "GROOM") {
  const { deps, calls } = setup(sources);
  const result = await buildStaffInvitationPreview(FIXTURE_PROJECT_ID, variant, staff, deps);
  if (result.status !== "READY") throw new Error(`expected READY, got ${JSON.stringify(result.issues)}`);
  return { result, calls };
}

describe("buildStaffInvitationPreview", () => {
  it.each(["COMMON", "GROOM", "BRIDE"])("composes a renderer-ready %s preview through the frozen pipeline", async (variant) => {
    const { result, calls } = await ready({}, variant);
    expect(result.rendererKey).toBe(ROW_RENDERER_KEY);
    expect(result.snapshot.variant).toBe(variant);
    expect(result.viewModel.variant).toBe(variant);
    expect(result.viewModel.template).toEqual({ templateVersionId: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: ROW_RENDERER_KEY });
    expect(Object.keys(result)).toEqual(["status", "snapshot", "viewModel", "rendererKey", "sections"]);
    // Every staff-scoped read uses the StaffContext client and this Project only.
    for (const call of calls) expect(call[1]).toBe("staff-client");
    for (const call of calls.filter(([name]) => name !== "templateVersion")) expect(call[2]).toBe(FIXTURE_PROJECT_ID);
  });

  it("accepts zero Timeline / Dress Code / media as valid absence", async () => {
    const { result, calls } = await ready({ media: [], timeline: [], dressCode: null });
    expect(result.snapshot.content.timeline).toEqual([]);
    expect(result.snapshot.content.dressCode).toBeNull();
    expect(result.sections).toMatchObject({ timeline: false, dressCode: false, gallery: false, music: false, photoStory: false });
    // Only the canonical groom QR reference from wedding_details remains to resolve.
    expect(calls.find(([name]) => name === "createMediaResolver")?.[3]).toEqual([FIXTURE_MEDIA_IDS.QR_GROOM]);
  });

  it("passes loaded Timeline and Dress Code into the Snapshot", async () => {
    const { result } = await ready({
      timeline: [{ id: stepId, projectId: FIXTURE_PROJECT_ID, time: "08:30", label: "Đón khách", sortOrder: 0, createdAt: stamp, updatedAt: stamp }],
      dressCode: {
        dressCode: { projectId: FIXTURE_PROJECT_ID, description: "Pastel", createdAt: stamp, updatedAt: stamp },
        swatches: [{ id: swatchId, projectId: FIXTURE_PROJECT_ID, color: "#3d352b", sortOrder: 0, createdAt: stamp, updatedAt: stamp }],
      },
    });
    expect(result.snapshot.content.timeline).toEqual([{ id: stepId, time: "08:30", label: "Đón khách" }]);
    expect(result.snapshot.content.dressCode).toEqual({ description: "Pastel", swatches: [{ id: swatchId, color: "#3d352b" }] });
  });

  it("takes the renderer key from the template-version row the design pins", async () => {
    const { result, calls } = await ready();
    expect(calls.filter(([name]) => name === "templateVersion")).toEqual([["templateVersion", "staff-client", design.templateVersionId]]);
    expect(result.snapshot.template).toEqual({ templateVersionId: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: ROW_RENDERER_KEY });
  });

  it("fails closed for an unregistered renderer key (no default, latest or alias)", async () => {
    const { deps } = setup({ templateVersion: { id: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: `${ROW_RENDERER_KEY}-unknown` } });
    const error = await buildStaffInvitationPreview(FIXTURE_PROJECT_ID, "GROOM", staff, deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RendererSelectionError);
    expect((error as RendererSelectionError).code).toBe("RENDERER_KEY_NOT_REGISTERED");
  });

  it("fails when the pinned template version is invisible or mismatched", async () => {
    for (const templateVersion of [null, { id: "f0000000-0000-4000-8000-000000000009", rendererKey: ROW_RENDERER_KEY }]) {
      const { deps } = setup({ templateVersion });
      await expect(buildStaffInvitationPreview(FIXTURE_PROJECT_ID, "GROOM", staff, deps)).rejects.toBeInstanceOf(
        StaffInvitationPreviewInvariantError,
      );
    }
  });

  it("resolves exactly the Snapshot media refs through the MediaResolver; UNAVAILABLE stays honest", async () => {
    const { result, calls } = await ready({ unavailable: [FIXTURE_MEDIA_IDS.QR_GROOM] });
    expect(calls.filter(([name]) => name === "createMediaResolver")).toEqual([
      ["createMediaResolver", "staff-client", FIXTURE_PROJECT_ID, extractSnapshotMediaRefs(result.snapshot)],
    ]);
    expect(extractSnapshotMediaRefs(result.snapshot)).toEqual([coverId, FIXTURE_MEDIA_IDS.QR_GROOM]);
    expect(result.viewModel.media.cover).toMatchObject({ status: "RESOLVED", url: `https://signed.test/${coverId}?token=t` });
    expect(JSON.stringify(result.viewModel)).toContain(`"status":"UNAVAILABLE","mediaId":"${FIXTURE_MEDIA_IDS.QR_GROOM}"`);
  });

  it("keeps signed URLs and storage paths out of the Snapshot JSON", async () => {
    const { result } = await ready();
    const snapshotJson = JSON.stringify(result.snapshot);
    expect(snapshotJson).not.toContain("signed.test");
    expect(snapshotJson).not.toContain("project-media");
    expect(snapshotJson).not.toContain("internal note");
    expect(JSON.stringify(result.viewModel)).toContain("signed.test");
  });

  it.each([
    "project",
    "weddingDetails",
    "events",
    "design",
    "templateVersion",
    "media",
    "timeline",
    "dressCode",
    "resolver",
  ] as const)("propagates a %s load failure instead of returning empty preview data", async (key) => {
    const { deps } = setup({ [key]: new Error(`${key} failed`) });
    await expect(buildStaffInvitationPreview(FIXTURE_PROJECT_ID, "GROOM", staff, deps)).rejects.toThrow(`${key} failed`);
  });

  it("fails loudly on cross-project records", async () => {
    const foreignEvent = { ...fixtureSource.events[0], projectId: otherProjectId };
    const cases: [Sources, new (message: string) => Error][] = [
      [{ project: { ...project, id: otherProjectId } }, StaffInvitationPreviewInvariantError],
      [{ design: { ...design, projectId: otherProjectId } }, StaffInvitationPreviewInvariantError],
      [{ weddingDetails: { ...weddingDetails, projectId: otherProjectId } }, SnapshotPayloadInvariantError],
      [{ events: [foreignEvent, ...fixtureSource.events.slice(1)] }, SnapshotPayloadInvariantError],
      [{ media: [media(coverId, "COVER", otherProjectId)] }, SnapshotPayloadInvariantError],
      [
        { timeline: [{ id: stepId, projectId: otherProjectId, time: "08:30", label: "x", sortOrder: 0, createdAt: stamp, updatedAt: stamp }] },
        SnapshotPayloadInvariantError,
      ],
      [
        { dressCode: { dressCode: { projectId: otherProjectId, description: null, createdAt: stamp, updatedAt: stamp }, swatches: [] } },
        SnapshotPayloadInvariantError,
      ],
    ];
    for (const [sources, errorType] of cases) {
      const { deps, calls } = setup(sources);
      await expect(buildStaffInvitationPreview(FIXTURE_PROJECT_ID, "GROOM", staff, deps)).rejects.toBeInstanceOf(errorType);
      expect(calls.some(([name]) => name === "createMediaResolver")).toBe(false);
    }
  });

  it("distinguishes bad input, a missing Project and a missing design", async () => {
    const expectApiError = async (promise: Promise<unknown>, kind: ApiError["kind"]) => {
      const error = await promise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe(kind);
    };
    const { deps, calls } = setup();
    await expectApiError(buildStaffInvitationPreview("not-a-uuid", "GROOM", staff, deps), "BAD_REQUEST");
    await expectApiError(buildStaffInvitationPreview(FIXTURE_PROJECT_ID, "groom", staff, deps), "BAD_REQUEST");
    expect(calls).toEqual([]);
    await expectApiError(buildStaffInvitationPreview(FIXTURE_PROJECT_ID, "GROOM", staff, setup({ project: null }).deps), "NOT_FOUND");
    await expectApiError(buildStaffInvitationPreview(FIXTURE_PROJECT_ID, "GROOM", staff, setup({ design: null }).deps), "CONFLICT");
  });

  it("returns the frozen builder's BLOCKED issues without resolving media", async () => {
    const { deps, calls } = setup({ weddingDetails: null });
    const result = await buildStaffInvitationPreview(FIXTURE_PROJECT_ID, "GROOM", staff, deps);
    expect(result).toEqual({ status: "BLOCKED", issues: [expect.objectContaining({ code: "WEDDING_DETAILS_MISSING" })] });
    expect(calls.some(([name]) => name === "createMediaResolver")).toBe(false);
  });
});

describe("static review (staff preview)", () => {
  const files = [
    "lib/server/invitation-preview/build-staff-invitation-preview.ts",
    "lib/server/invitation-preview/staff-invitation-preview-supabase.ts",
    "lib/server/invitation-preview/template-version-binding-gateway.ts",
    "lib/server/supabase/template-version-binding-repository.ts",
  ];
  const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

  it.each(files)("%s never uses service_role or an elevated client", (file) => {
    expect(read(file)).not.toMatch(/service[-_]?role|SERVICE_ROLE|createServiceRole/i);
  });

  it.each(files)("%s performs no write, publish or invitation_versions access", (file) => {
    expect(read(file)).not.toMatch(/from\(\s*["']invitation_version|\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(|publish[A-Z(]/);
  });

  it.each(files)("%s hard-codes no renderer key", (file) => {
    expect(read(file)).not.toMatch(/elegant-editorial|wedding\.[a-z-]+\.v\d/);
  });
});
