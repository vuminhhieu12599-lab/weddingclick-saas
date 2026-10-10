import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { MediaType } from "../../../domain";
import { lookupTemplateEditorManifest, PRODUCTION_EDITOR_MANIFESTS } from "../../../../templates/core/production-editor-manifests";
import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectMediaRecord } from "../../media/media-types";
import type { SetTemplateMediaSlotDependencies } from "../../template-media/set-template-media-slot";
import type { TemplateMediaSlotGateway } from "../../template-media/template-media-slot-gateway";
import type { PhotoLibraryDependencies } from "../../template-editor/photo-library";
import { listTemplates } from "../../templates/list-templates";
import type { RawTemplateCatalogRow } from "../../templates/templates-types";
import {
  handleEditorReadinessRequest,
  handleListPhotoLibraryRequest,
  handleListTemplateMediaSlotsRequest,
  handleSetTemplateMediaSlotRequest,
} from "../template-editor";

/** TE-05A — Staff template-editor routes, photo library and catalog editor manifests. */

const ROOT = join(__dirname, "..", "..", "..", "..");
type Client = { marker: string };
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const VH_VERSION = "22222222-2222-4222-8222-222222222222";
const EE_VERSION = "22222222-2222-4222-8222-222222222221";
const PHOTO = "33333333-3333-4333-8333-333333333331";

function auth(staff: boolean): StaffAuthGateway<Client> {
  return {
    createClient: (token) => ({ marker: token }),
    getAuthenticatedUserId: async () => (staff ? "staff-1" : "user-1"),
    getActiveStaffProfile: async () => (staff ? { role: "STAFF", displayName: "Staff" } : null),
  };
}
const STAFF_AUTH = auth(true);

function slotDeps(rendererKey = "wedding.vietnamese-heritage.v1", designVersion = VH_VERSION) {
  const replaceSlot = vi.fn(async (_c: Client, command: { slotKey: string; projectMediaIds: readonly string[] }) =>
    command.projectMediaIds.map((projectMediaId, position) => ({ slotKey: command.slotKey, position, projectMediaId })),
  );
  const slots: TemplateMediaSlotGateway<Client> = { listSlotItems: vi.fn(async () => [{ slotKey: "heroPhoto", position: 0, projectMediaId: PHOTO }]), replaceSlot };
  const deps: SetTemplateMediaSlotDependencies<Client> = {
    projects: { getProjectById: async () => ({ id: PROJECT_ID }) as never },
    design: { getCurrentProjectDesign: async () => ({ projectId: PROJECT_ID, templateVersionId: designVersion }) as never },
    templateVersions: { getTemplateVersionBinding: async (_c, id) => ({ id, rendererKey }) },
    slots,
    lookupEditorManifest: lookupTemplateEditorManifest,
  };
  return { deps, slots, replaceSlot };
}

describe("template catalog editorManifest", () => {
  const row = (rendererKey: string, manifest: unknown = { schemaVersion: 1, palettes: ["p"], fontPresets: ["f"], effectPresets: ["e"], sectionSettingsSchema: {}, designSettingsSchema: {} }): RawTemplateCatalogRow => ({
    id: "t1",
    code: "x",
    eventType: "WEDDING",
    name: "X",
    description: null,
    isActive: true,
    sortOrder: 1,
    previewMediaPath: null,
    versions: [{ id: VH_VERSION, versionNumber: 1, rendererKey, manifest, retiredAt: null }],
  });
  const staff = { userId: "s", role: "STAFF" as const, displayName: "S", supabase: { marker: "c" } };

  it("exposes the registry-owned manifest per renderer key", async () => {
    for (const manifest of PRODUCTION_EDITOR_MANIFESTS) {
      const [entry] = await listTemplates(staff, { listTemplatesWithVersions: async () => [row(manifest.rendererKey)] }, lookupTemplateEditorManifest);
      expect(entry?.versions[0]?.editorManifest).toBe(lookupTemplateEditorManifest(manifest.rendererKey));
    }
  });

  it("never reads the editor manifest from DB manifest JSON", async () => {
    const poisoned = { ...row("wedding.vietnamese-heritage.v1").versions[0]!.manifest as object, mediaSlots: [], mediaModel: "LEGACY_ROLES" };
    const [entry] = await listTemplates(staff, { listTemplatesWithVersions: async () => [row("wedding.vietnamese-heritage.v1", poisoned)] }, lookupTemplateEditorManifest);
    expect(entry?.versions[0]?.editorManifest?.mediaModel).toBe("TEMPLATE_SLOTS");
  });

  it("a non-production renderer key gets null (fail closed in the UI, no default)", async () => {
    const [entry] = await listTemplates(staff, { listTemplatesWithVersions: async () => [row("wedding.unknown.v1")] }, lookupTemplateEditorManifest);
    expect(entry?.versions[0]?.editorManifest).toBeNull();
  });

  it("the catalog server path imports no renderer component, client module or CSS", () => {
    for (const file of ["lib/server/templates/list-templates.ts", "lib/server/routes/templates.ts", "app/api/v2/internal/templates/route.ts", "lib/server/routes/template-editor.ts"]) {
      const code = readFileSync(join(ROOT, file), "utf8");
      expect(code, file).not.toMatch(/templates\/wedding\/|production-renderer-bindings|invitation-renderer-host|\.css["']|["']use client["']/);
    }
  });
});

describe("template media slot routes", () => {
  it("GET requires Bearer staff auth and is no-store", async () => {
    const { slots } = slotDeps();
    const missing = await handleListTemplateMediaSlotsRequest(null, PROJECT_ID, VH_VERSION, STAFF_AUTH, slots);
    expect(missing.status).toBe(401);
    expect(missing.headers["Cache-Control"]).toBe("no-store");
    expect((await handleListTemplateMediaSlotsRequest("Bearer t", PROJECT_ID, VH_VERSION, auth(false), slots)).status).toBe(403);
    const ok = await handleListTemplateMediaSlotsRequest("Bearer t", PROJECT_ID, VH_VERSION, STAFF_AUTH, slots);
    expect(ok.status).toBe(200);
    expect(ok.headers["Cache-Control"]).toBe("no-store");
    expect(ok.body).toEqual({ data: [{ slotKey: "heroPhoto", position: 0, projectMediaId: PHOTO }] });
    expect((await handleListTemplateMediaSlotsRequest("Bearer t", PROJECT_ID, null, STAFF_AUTH, slots)).status).toBe(400);
    expect((await handleListTemplateMediaSlotsRequest("Bearer t", PROJECT_ID, "x", STAFF_AUTH, slots)).status).toBe(400);
  });

  it("PUT authenticates before reading the body", async () => {
    const readBody = vi.fn(async () => ({}));
    for (const [header, gateway] of [[null, STAFF_AUTH], ["Bearer t", auth(false)]] as const) {
      const result = await handleSetTemplateMediaSlotRequest(header, PROJECT_ID, readBody, gateway, slotDeps().deps);
      expect([401, 403]).toContain(result.status);
    }
    expect(readBody).not.toHaveBeenCalled();
  });

  it("PUT accepts exactly { templateVersionId, slotKey, projectMediaIds }; [] clears", async () => {
    const { deps, replaceSlot } = slotDeps();
    const ok = await handleSetTemplateMediaSlotRequest("Bearer t", PROJECT_ID, async () => ({ templateVersionId: VH_VERSION, slotKey: "heroPhoto", projectMediaIds: [] }), STAFF_AUTH, deps);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ data: [] });
    expect(ok.headers["Cache-Control"]).toBe("no-store");
    expect(replaceSlot.mock.calls[0]?.[1]).toMatchObject({ slotKey: "heroPhoto", projectMediaIds: [] });
    for (const extra of ["rendererKey", "variant", "maxCount", "cardinality", "manifest", "positions"]) {
      const bad = await handleSetTemplateMediaSlotRequest("Bearer t", PROJECT_ID, async () => ({ templateVersionId: VH_VERSION, slotKey: "heroPhoto", projectMediaIds: [], [extra]: 1 }), STAFF_AUTH, deps);
      expect(bad.status, extra).toBe(400);
    }
    const badJson = await handleSetTemplateMediaSlotRequest("Bearer t", PROJECT_ID, async () => { throw new SyntaxError("x"); }, STAFF_AUTH, deps);
    expect(badJson.status).toBe(400);
  });

  it("maps template-version mismatch to 409 and LEGACY_ROLES writes to 422", async () => {
    const mismatch = await handleSetTemplateMediaSlotRequest("Bearer t", PROJECT_ID, async () => ({ templateVersionId: EE_VERSION, slotKey: "heroPhoto", projectMediaIds: [] }), STAFF_AUTH, slotDeps().deps);
    expect(mismatch.status).toBe(409);
    const legacy = await handleSetTemplateMediaSlotRequest(
      "Bearer t",
      PROJECT_ID,
      async () => ({ templateVersionId: EE_VERSION, slotKey: "heroPhoto", projectMediaIds: [] }),
      STAFF_AUTH,
      slotDeps("wedding.elegant-editorial.v1", EE_VERSION).deps,
    );
    expect(legacy.status).toBe(422);
  });

  it("RPC ApiErrors keep their status; unknown errors are a generic 500", async () => {
    const { deps, replaceSlot } = slotDeps();
    replaceSlot.mockRejectedValueOnce(new ApiError("CONFLICT", "Project template version changed; reload and try again"));
    const conflict = await handleSetTemplateMediaSlotRequest("Bearer t", PROJECT_ID, async () => ({ templateVersionId: VH_VERSION, slotKey: "gallery", projectMediaIds: [PHOTO] }), STAFF_AUTH, deps);
    expect(conflict.status).toBe(409);
    replaceSlot.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint project_template_media_slot_items_pkey"));
    const internal = await handleSetTemplateMediaSlotRequest("Bearer t", PROJECT_ID, async () => ({ templateVersionId: VH_VERSION, slotKey: "gallery", projectMediaIds: [PHOTO] }), STAFF_AUTH, deps);
    expect(internal.status).toBe(500);
    expect(JSON.stringify(internal.body)).not.toMatch(/duplicate|constraint|project_template/);
  });
});

// ---------------------------------------------------------------------------

function mediaRow(id: string, mediaType: MediaType, projectId = PROJECT_ID, createdAt = "2026-10-01T00:00:00Z"): ProjectMediaRecord {
  return { id, projectId, mediaType, storageBucket: "project-media", storagePath: `${projectId}/${id}`, mimeType: "image/webp", sizeBytes: 1234, width: 1200, height: 1600, altText: null, sortOrder: 0, createdBy: "creator", createdAt, updatedAt: createdAt };
}

const ID = (n: number) => `44444444-4444-4444-8444-4444444444${String(n).padStart(2, "0")}`;

function libraryDeps(rows: ProjectMediaRecord[], options: { exists?: boolean; unsigned?: string[] } = {}) {
  const createMediaResolver = vi.fn(async (_c: Client, _projectId: string, ids: readonly string[]) => ({
    resolveMedia: async (id: string) =>
      options.unsigned?.includes(id) || !ids.includes(id)
        ? ({ status: "UNAVAILABLE", mediaId: id } as const)
        : ({ status: "RESOLVED", mediaId: id, url: `https://signed.example/${id}?token=t`, width: 1200, height: 1600 } as const),
  }));
  const deps: PhotoLibraryDependencies<Client> = {
    media: { projectExists: async () => options.exists ?? true, listProjectMedia: async () => rows },
    createMediaResolver,
  };
  return { deps, createMediaResolver };
}

describe("photo library", () => {
  const all: ProjectMediaRecord[] = [
    mediaRow(ID(1), "PHOTO", PROJECT_ID, "2026-10-03T00:00:00Z"),
    mediaRow(ID(2), "COVER", PROJECT_ID, "2026-10-01T00:00:00Z"),
    mediaRow(ID(3), "GALLERY"),
    mediaRow(ID(4), "PORTRAIT_GROOM"),
    mediaRow(ID(5), "PORTRAIT_BRIDE"),
    mediaRow(ID(6), "PHOTO_STORY"),
    mediaRow(ID(7), "LOVE_STORY_PHOTO"),
    mediaRow(ID(8), "AUDIO"),
    mediaRow(ID(9), "QR_GROOM"),
    mediaRow(ID(10), "QR_BRIDE"),
    mediaRow(ID(11), "QR_COMMON"),
    mediaRow(ID(12), "SOCIAL_SHARE_COVER"),
  ];

  it("returns exactly the slot-assignable photos with signed previews and no storage data", async () => {
    const { deps, createMediaResolver } = libraryDeps(all, { unsigned: [ID(3)] });
    const result = await handleListPhotoLibraryRequest("Bearer t", PROJECT_ID, STAFF_AUTH, deps);
    expect(result.status).toBe(200);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    const data = (result.body as unknown as { data: Record<string, unknown>[] }).data;
    expect(data.map((item) => item.mediaType).sort()).toEqual(["COVER", "GALLERY", "LOVE_STORY_PHOTO", "PHOTO", "PHOTO_STORY", "PORTRAIT_BRIDE", "PORTRAIT_GROOM"]);
    for (const item of data) {
      expect(Object.keys(item).sort()).toEqual(["createdAt", "height", "id", "mediaType", "mimeType", "previewUrl", "sizeBytes", "width"]);
    }
    expect(data.find((item) => item.id === ID(3))?.previewUrl).toBeNull();
    expect(data.find((item) => item.id === ID(1))?.previewUrl).toBe(`https://signed.example/${ID(1)}?token=t`);
    expect(JSON.stringify(data)).not.toMatch(/project-media|storagePath|createdBy|creator/);
    // Only assignable ids are ever sent to the signer.
    expect([...(createMediaResolver.mock.calls[0]?.[2] ?? [])].sort()).toEqual([ID(1), ID(2), ID(3), ID(4), ID(5), ID(6), ID(7)].sort());
    expect(data[0]?.id).toBe(ID(2));
  });

  it("missing/foreign Project is safe", async () => {
    expect((await handleListPhotoLibraryRequest("Bearer t", PROJECT_ID, STAFF_AUTH, libraryDeps(all, { exists: false }).deps)).status).toBe(404);
    expect((await handleListPhotoLibraryRequest("Bearer t", "nope", STAFF_AUTH, libraryDeps(all).deps)).status).toBe(400);
    const foreign = await handleListPhotoLibraryRequest("Bearer t", PROJECT_ID, STAFF_AUTH, libraryDeps([mediaRow(ID(1), "PHOTO", "99999999-9999-4999-8999-999999999999")]).deps);
    expect((foreign.body as { data: unknown[] }).data).toEqual([]);
    expect((await handleListPhotoLibraryRequest(null, PROJECT_ID, STAFF_AUTH, libraryDeps(all).deps)).status).toBe(401);
  });
});

describe("editor readiness route", () => {
  it("is staff-only and no-store", async () => {
    const result = await handleEditorReadinessRequest(null, PROJECT_ID, STAFF_AUTH, {} as never);
    expect(result.status).toBe(401);
    expect(result.headers["Cache-Control"]).toBe("no-store");
  });
});

describe("TE-05A boundaries", () => {
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? (entry.name === "__tests__" ? [] : walk(`${dir}/${entry.name}`)) : [`${dir}/${entry.name}`],
    );

  it("new server modules use no elevated credential", () => {
    for (const file of [
      ...walk("lib/server/template-editor"),
      "lib/server/routes/template-editor.ts",
      "app/api/v2/internal/projects/[id]/template-media-slots/route.ts",
      "app/api/v2/internal/projects/[id]/photo-library/route.ts",
      "app/api/v2/internal/projects/[id]/editor-readiness/route.ts",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/service-role|service_role|SERVICE_ROLE|process\.env/);
    }
  });

  it("editor UI modules never import Supabase or server repositories directly", () => {
    const ui = [
      "template-media-slot-editor.tsx",
      "editor-readiness-panel.tsx",
      "optional-invitation-content.tsx",
      "data-tab.tsx",
      "design-tab.tsx",
    ].map((name) => `app/admin/v2/projects/[projectId]/_components/${name}`);
    for (const file of [...ui, "lib/admin/template-slot-editor.ts", "lib/admin/template-editor-presentation.ts"]) {
      const code = readFileSync(join(ROOT, file), "utf8");
      expect(code, file).not.toMatch(/@supabase|lib\/server\/supabase|service-role|templates\/wedding\/|production-editor-manifests/);
      for (const line of code.split("\n").filter((entry) => /^import .*lib\/server\//.test(entry))) {
        expect(line, `${file}: ${line}`).toMatch(/^import type /);
      }
    }
  });

  it("adds no migration and no Snapshot/ViewModel change", () => {
    // OWS-04 (checkpoint maintenance): exactly the data-only catalog seed 0047 may follow 0046.
    expect(readdirSync(join(ROOT, "supabase/migrations")).sort().slice(-2)).toEqual(["20260911041206_0046_project_template_media_slots.sql", "20260911041207_0047_seed_our_wedding_story_v1_catalog.sql"]);
  });
});
