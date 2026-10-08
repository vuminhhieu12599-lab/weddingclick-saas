import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import { buildRendererFixtureSourceInput, FIXTURE_MEDIA_IDS, FIXTURE_PROJECT_ID } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import {
  buildSnapshotPayload,
  extractSnapshotMediaRefs,
  resolveSnapshotMedia,
} from "../../../invitation-rendering";
import type { StaffContext } from "../../auth/staff-context";
import type { ProjectMediaRecord } from "../../media/media-types";
import type { ProjectDressCodeWithSwatches } from "../../project-dress-code/project-dress-code-gateway";
import type { ProjectTimelineItemRecord } from "../../project-timeline/project-timeline-types";
import { createSupabaseMediaResolver } from "../../supabase/supabase-media-resolver";
import {
  loadSnapshotPayloadInput,
  type SnapshotCanonicalSources,
  type SnapshotContentSourceGateways,
} from "../load-snapshot-payload-input";

const stamp = "2026-10-01T00:00:00+00:00";
const coverId = "c0000000-0000-4000-8000-000000000001";
const storyId = "c0000000-0000-4000-8000-000000000002";
const swatchId = "c0000000-0000-4000-8000-000000000003";
const stepId = "c0000000-0000-4000-8000-000000000004";

/** Canonical records only (fixture wedding data); the content sources come from the gateways below. */
function canonicalSources(): SnapshotCanonicalSources {
  const { project, variant, weddingDetails, events, design, templateVersion } = buildRendererFixtureSourceInput({
    variant: "GROOM",
  });
  return { project, variant, weddingDetails, events, design, templateVersion };
}

function mediaRecord(id: string, mediaType: ProjectMediaRecord["mediaType"], sortOrder: number): ProjectMediaRecord {
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
    sortOrder,
    createdBy: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

const staff: StaffContext<string> = { userId: "u", role: "STAFF", displayName: "Staff", supabase: "staff-client" };

function gateways(sources: {
  media?: ProjectMediaRecord[] | Error;
  timeline?: ProjectTimelineItemRecord[] | Error;
  dressCode?: ProjectDressCodeWithSwatches | null | Error;
}) {
  const seen: unknown[][] = [];
  const settle = async <T>(value: T | Error): Promise<T> => {
    if (value instanceof Error) throw value;
    return value;
  };
  const result: SnapshotContentSourceGateways<string> = {
    media: { listProjectMedia: (client, projectId) => (seen.push(["media", client, projectId]), settle(sources.media ?? [])) },
    timeline: {
      listProjectTimelineItems: (client, projectId) => (seen.push(["timeline", client, projectId]), settle(sources.timeline ?? [])),
    },
    dressCode: {
      getProjectDressCode: (client, projectId) => (seen.push(["dressCode", client, projectId]), settle(sources.dressCode ?? null)),
    },
    // TE-04: legacy (Elegant Editorial) inputs never read template slot rows.
    templateSlots: { listSlotItems: () => Promise.reject(new Error("LEGACY_ROLES must not read template slots")) },
    lookupEditorManifest: lookupTemplateEditorManifest,
  };
  return { result, seen };
}

describe("loadSnapshotPayloadInput", () => {
  it("loads every content source with the staff client, scoped to the Project", async () => {
    const { result, seen } = gateways({});
    await loadSnapshotPayloadInput(canonicalSources(), staff, result);
    expect(seen).toEqual([
      ["media", "staff-client", FIXTURE_PROJECT_ID],
      ["timeline", "staff-client", FIXTURE_PROJECT_ID],
      ["dressCode", "staff-client", FIXTURE_PROJECT_ID],
    ]);
  });

  it("treats absence as valid data: no media/timeline [] and no Dress Code null, with no defaults", async () => {
    const { result } = gateways({});
    const input = await loadSnapshotPayloadInput(canonicalSources(), staff, result);
    expect(input).toMatchObject({ media: [], timelineItems: [], dressCode: null, dressCodeSwatches: [] });

    const built = buildSnapshotPayload(input);
    if (built.status !== "SUCCESS") throw new Error("expected SUCCESS");
    expect(built.payload.content.timeline).toEqual([]);
    expect(built.payload.content.dressCode).toBeNull();
    expect(built.payload.sections).toMatchObject({ timeline: false, dressCode: false, gallery: false, photoStory: false });
    // Only the canonical wedding_details groom QR reference (GROOM variant) remains.
    expect(built.payload.media).toEqual({ galleryMediaIds: [], qr: { groomMediaId: FIXTURE_MEDIA_IDS.QR_GROOM } });
  });

  it("projects media rows to builder source fields only (no storage path) and keeps every row", async () => {
    const { result } = gateways({
      media: [mediaRecord(coverId, "COVER", 0), mediaRecord(storyId, "PHOTO_STORY", 0), mediaRecord("c0000000-0000-4000-8000-000000000009", "QR_COMMON", 0)],
    });
    const input = await loadSnapshotPayloadInput(canonicalSources(), staff, result);
    expect(input.media).toEqual([
      { id: coverId, projectId: FIXTURE_PROJECT_ID, mediaType: "COVER", sortOrder: 0 },
      { id: storyId, projectId: FIXTURE_PROJECT_ID, mediaType: "PHOTO_STORY", sortOrder: 0 },
      { id: "c0000000-0000-4000-8000-000000000009", projectId: FIXTURE_PROJECT_ID, mediaType: "QR_COMMON", sortOrder: 0 },
    ]);

    const built = buildSnapshotPayload(input);
    if (built.status !== "SUCCESS") throw new Error("expected SUCCESS");
    // Roles stay separate; a stored QR_COMMON row is loaded but never becomes a renderer role.
    expect(built.payload.media).toEqual({
      coverMediaId: coverId,
      galleryMediaIds: [],
      qr: { groomMediaId: FIXTURE_MEDIA_IDS.QR_GROOM },
      photoStoryMediaIds: [storyId],
    });
  });

  it("passes loaded Timeline and Dress Code into the frozen builder unchanged", async () => {
    const { result } = gateways({
      timeline: [{ id: stepId, projectId: FIXTURE_PROJECT_ID, time: "08:30", label: "Đón khách", sortOrder: 0, createdAt: stamp, updatedAt: stamp }],
      dressCode: {
        dressCode: { projectId: FIXTURE_PROJECT_ID, description: null, createdAt: stamp, updatedAt: stamp },
        swatches: [{ id: swatchId, projectId: FIXTURE_PROJECT_ID, color: "#3d352b", sortOrder: 0, createdAt: stamp, updatedAt: stamp }],
      },
    });
    const built = buildSnapshotPayload(await loadSnapshotPayloadInput(canonicalSources(), staff, result));
    if (built.status !== "SUCCESS") throw new Error("expected SUCCESS");
    expect(built.payload.content.timeline).toEqual([{ id: stepId, time: "08:30", label: "Đón khách" }]);
    expect(built.payload.content.dressCode).toEqual({ description: null, swatches: [{ id: swatchId, color: "#3d352b" }] });
  });

  it.each(["media", "timeline", "dressCode"] as const)("propagates a %s load failure instead of returning absence", async (key) => {
    const { result } = gateways({ [key]: new Error(`${key} failed`) });
    await expect(loadSnapshotPayloadInput(canonicalSources(), staff, result)).rejects.toThrow(`${key} failed`);
  });

  it("rejects a non-UUID project id before loading anything", async () => {
    const { result, seen } = gateways({});
    const canonical = canonicalSources();
    await expect(
      loadSnapshotPayloadInput({ ...canonical, project: { ...canonical.project, id: "p1" } }, staff, result),
    ).rejects.toThrow("valid UUID");
    expect(seen).toEqual([]);
  });

  it("feeds Snapshot refs through the Supabase resolver end-to-end (runtime URLs never enter the payload)", async () => {
    const { result } = gateways({ media: [mediaRecord(coverId, "COVER", 0)] });
    const built = buildSnapshotPayload(await loadSnapshotPayloadInput(canonicalSources(), staff, result));
    if (built.status !== "SUCCESS") throw new Error("expected SUCCESS");

    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      then: (resolve: (value: unknown) => unknown) =>
        resolve({
          data: [{ id: coverId, project_id: FIXTURE_PROJECT_ID, storage_bucket: "project-media", storage_path: `${FIXTURE_PROJECT_ID}/${coverId}`, width: 800, height: 600 }],
          error: null,
        }),
    };
    const client = {
      from: () => builder,
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => ({
            data: paths.map((path) => ({ error: null, path, signedURL: null, signedUrl: `https://signed.test/${path}` })),
            error: null,
          }),
        }),
      },
    } as unknown as SupabaseClient;

    const resolver = await createSupabaseMediaResolver(client, FIXTURE_PROJECT_ID, extractSnapshotMediaRefs(built.payload));
    expect(await resolveSnapshotMedia(built.payload, resolver)).toEqual([
      { status: "RESOLVED", mediaId: coverId, url: `https://signed.test/${FIXTURE_PROJECT_ID}/${coverId}`, width: 800, height: 600 },
      // Referenced QR with no row returned for this Project: honest UNAVAILABLE, no fallback.
      { status: "UNAVAILABLE", mediaId: FIXTURE_MEDIA_IDS.QR_GROOM },
    ]);
    expect(JSON.stringify(built.payload)).not.toContain("signed.test");
    expect(JSON.stringify(built.payload)).not.toContain("project-media");
  });
});

describe("static security review (real-data loaders + media resolver)", () => {
  const files = [
    "lib/server/invitation-snapshot/load-snapshot-payload-input.ts",
    "lib/server/supabase/project-timeline-repository.ts",
    "lib/server/supabase/project-dress-code-repository.ts",
    "lib/server/supabase/supabase-media-resolver.ts",
  ];

  it.each(files)("%s never uses service_role or an elevated client", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).not.toMatch(/service[-_]?role|SERVICE_ROLE|createServiceRole/i);
  });
});
