import { describe, expect, it, vi } from "vitest";

import type { MediaType } from "../../../domain";
import {
  buildRendererFixtureSourceInput,
  FIXTURE_MEDIA_IDS,
  FIXTURE_PROJECT_ID,
  FIXTURE_TEMPLATE_VERSION_ID,
} from "../../../../templates/core/fixtures/renderer-fixture-sources";
import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import type { StaffContext } from "../../auth/staff-context";
import type { ProjectMediaRecord } from "../../media/media-types";
import type { TemplateMediaSlotItem } from "../../template-media/template-media-slot-types";
import type { WeddingDetailsRecord } from "../../wedding-details/wedding-details-types";
import { evaluateEditorReadiness, TEMPLATE_MEDIA_INVALID_MESSAGE, type EditorReadinessInput } from "../editor-readiness";
import { loadEditorReadiness, type EditorReadinessDependencies } from "../load-editor-readiness";

/** TE-05A — template-aware Staff readiness (docs/DECISIONS.md "TE-05A"). */

const EE = lookupTemplateEditorManifest("wedding.elegant-editorial.v1")!;
const VH = lookupTemplateEditorManifest("wedding.vietnamese-heritage.v1")!;
const STAMP = "2026-10-01T00:00:00Z";

function details(overrides: Partial<WeddingDetailsRecord> = {}): WeddingDetailsRecord {
  const base = buildRendererFixtureSourceInput({ variant: "COMMON" }).weddingDetails!;
  return { id: "d0000000-0000-4000-8000-000000000001", lunarDateDisplay: null, additionalNote: null, createdAt: STAMP, updatedAt: STAMP, ...base, ...overrides } as WeddingDetailsRecord;
}

const EVENTS = buildRendererFixtureSourceInput({ variant: "COMMON" }).events;

function selected(overrides: Partial<Extract<EditorReadinessInput, { template: "SELECTED" }>> = {}): EditorReadinessInput {
  return {
    template: "SELECTED",
    manifest: VH,
    requiredVariants: ["COMMON"],
    weddingDetails: details(),
    events: EVENTS,
    timelineItemCount: 2,
    dressCode: { description: "Áo dài", swatchCount: 2 },
    hasAudio: true,
    slotCounts: { heroPhoto: 1, portraitCluster: 3, loveStoryPhoto: 1, gallery: 4 },
    ...overrides,
  };
}

const statusOf = (input: EditorReadinessInput, key: string) => evaluateEditorReadiness(input).items.find((item) => item.key === key);

describe("evaluateEditorReadiness", () => {
  it("no template → BLOCKING with 'Chọn mẫu thiệp'", () => {
    const result = evaluateEditorReadiness({ template: "NOT_SELECTED" });
    expect(result.overall).toBe("BLOCKING");
    expect(result.nextAction).toBe("Chọn mẫu thiệp");
  });

  it("everything present → READY", () => {
    const result = evaluateEditorReadiness(selected());
    expect(result.overall).toBe("READY");
    expect(result.nextAction).toBe("Sẵn sàng xem trước");
    expect(result.items.map((item) => item.key)).toEqual([...VH.contentItems.map((item) => item.key), ...VH.mediaSlots.map((slot) => slot.key)]);
  });

  it("missing couple names → BLOCKING (snapshot non-blank rule)", () => {
    const input = selected({ weddingDetails: details({ brideName: "   " }) });
    expect(statusOf(input, "COUPLE")?.status).toBe("BLOCKING");
    expect(evaluateEditorReadiness(input).nextAction).toBe("Nhập đầy đủ tên cô dâu và chú rể");
    expect(statusOf(selected({ weddingDetails: null }), "COUPLE")?.status).toBe("BLOCKING");
  });

  it("missing ceremony → BLOCKING via the canonical resolver (per required variant)", () => {
    expect(statusOf(selected({ events: [] }), "EVENTS")?.status).toBe("BLOCKING");
    expect(evaluateEditorReadiness(selected({ events: [] })).nextAction).toBe("Thêm sự kiện lễ chính");
    const groomOnly = EVENTS.filter((event) => event.occasionType !== "VU_QUY");
    expect(statusOf(selected({ events: groomOnly, requiredVariants: ["GROOM"] }), "EVENTS")?.status).toBe("COMPLETE");
    expect(statusOf(selected({ events: groomOnly, requiredVariants: ["GROOM", "BRIDE"] }), "EVENTS")?.status).toBe("BLOCKING");
    expect(statusOf(selected({ requiredVariants: null }), "EVENTS")?.status).toBe("BLOCKING");
  });

  it("incomplete families → WARNING, never a blocker", () => {
    const input = selected({ weddingDetails: details({ brideFather: null, brideMother: " " }) });
    expect(statusOf(input, "FAMILIES")?.status).toBe("WARNING");
    expect(evaluateEditorReadiness(input).overall).toBe("WARNING");
    expect(evaluateEditorReadiness(input).nextAction).toBe("Bổ sung thông tin gia đình hai bên");
  });

  it("absent optional content → NOT_USED and still READY", () => {
    const input = selected({
      weddingDetails: details({ loveStory: null, groomBankName: null, groomBankAccountName: null, groomBankAccountNumber: null, groomBankQrMediaId: null, brideBankName: null, brideBankAccountName: null, brideBankAccountNumber: null, brideBankQrMediaId: null }),
      timelineItemCount: 0,
      dressCode: null,
      hasAudio: false,
      slotCounts: { heroPhoto: 1, portraitCluster: 3, loveStoryPhoto: 0, gallery: 0 },
    });
    for (const key of ["LOVE_STORY", "TIMELINE", "DRESS_CODE", "GIFT", "MUSIC", "loveStoryPhoto", "gallery"]) {
      expect(statusOf(input, key)?.status, key).toBe("NOT_USED");
    }
    const result = evaluateEditorReadiness(input);
    expect(result.overall).toBe("READY");
    expect(result.nextAction).toBe("Sẵn sàng xem trước");
  });

  it.each([
    [0, "WARNING", "Đã có 0/3 ảnh"],
    [2, "WARNING", "Đã có 2/3 ảnh"],
    [3, "COMPLETE", "Đã có 3/3 ảnh"],
  ])("recommended slot %i/3 → %s", (count, status, message) => {
    const item = statusOf(selected({ slotCounts: { heroPhoto: 1, portraitCluster: count, loveStoryPhoto: 0, gallery: 0 } }), "portraitCluster");
    expect(item?.status).toBe(status);
    expect(item?.message).toBe(message);
  });

  it("warning-only → WARNING; content warnings outrank media warnings in nextAction", () => {
    const mediaOnly = evaluateEditorReadiness(selected({ slotCounts: { heroPhoto: 0, portraitCluster: 2, loveStoryPhoto: 0, gallery: 0 } }));
    expect(mediaOnly.overall).toBe("WARNING");
    expect(mediaOnly.nextAction).toBe("Thêm 1 ảnh vào Ảnh chính");
    const both = evaluateEditorReadiness(
      selected({ weddingDetails: details({ groomFather: null, groomMother: null }), slotCounts: { heroPhoto: 1, portraitCluster: 2, loveStoryPhoto: 0, gallery: 0 } }),
    );
    expect(both.nextAction).toBe("Bổ sung thông tin gia đình hai bên");
    const clusterOnly = evaluateEditorReadiness(selected({ slotCounts: { heroPhoto: 1, portraitCluster: 2, loveStoryPhoto: 0, gallery: 0 } }));
    expect(clusterOnly.nextAction).toBe("Thêm 1 ảnh vào Cụm ảnh ba khung");
  });

  it("blocking content outranks everything; optional items never become nextAction", () => {
    const result = evaluateEditorReadiness(selected({ events: [], hasAudio: false, timelineItemCount: 0, slotCounts: { heroPhoto: 0, portraitCluster: 0, loveStoryPhoto: 0, gallery: 0 } }));
    expect(result.overall).toBe("BLOCKING");
    expect(result.nextAction).toBe("Thêm sự kiện lễ chính");
    expect(result.nextAction).not.toMatch(/nhạc|Lịch trình|Album/);
  });

  it("no media slot is ever BLOCKING; LEGACY_ROLES has no slot items", () => {
    const empty = evaluateEditorReadiness(selected({ slotCounts: { heroPhoto: 0, portraitCluster: 0, loveStoryPhoto: 0, gallery: 0 } }));
    expect(empty.items.filter((item) => item.kind === "MEDIA_SLOT").every((item) => item.status !== "BLOCKING")).toBe(true);
    const legacy = evaluateEditorReadiness(selected({ manifest: EE, slotCounts: null }));
    expect(legacy.items.some((item) => item.kind === "MEDIA_SLOT")).toBe(false);
    expect(legacy.overall).toBe("READY");
  });

  it("invalid slot configuration → safe BLOCKING item, fixed message", () => {
    const result = evaluateEditorReadiness(selected({ slotCounts: "INVALID" }));
    expect(result.overall).toBe("BLOCKING");
    expect(result.items.find((item) => item.key === "TEMPLATE_MEDIA_INVALID")?.message).toBe(TEMPLATE_MEDIA_INVALID_MESSAGE);
    expect(JSON.stringify(result)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("is deterministic", () => {
    expect(evaluateEditorReadiness(selected())).toStrictEqual(evaluateEditorReadiness(selected()));
  });
});

// ---------------------------------------------------------------------------

const STAFF: StaffContext<string> = { userId: "u", role: "STAFF", displayName: "Staff", supabase: "client" };
const VH_VERSION = FIXTURE_TEMPLATE_VERSION_ID;
const PHOTO_ID = "00000000-0000-4000-8000-0000000003a1";

function mediaRow(id: string, mediaType: MediaType): ProjectMediaRecord {
  return { id, projectId: FIXTURE_PROJECT_ID, mediaType, storageBucket: "project-media", storagePath: `${FIXTURE_PROJECT_ID}/${id}`, mimeType: "image/webp", sizeBytes: 1, width: 10, height: 10, altText: null, sortOrder: 0, createdBy: null, createdAt: STAMP, updatedAt: STAMP };
}

function deps(options: { design?: string | null; rendererKey?: string; rows?: TemplateMediaSlotItem[]; media?: ProjectMediaRecord[] } = {}) {
  const listSlotItems = vi.fn(async () => options.rows ?? []);
  const value: EditorReadinessDependencies<string> = {
    projects: { getProjectById: async () => ({ id: FIXTURE_PROJECT_ID, packageCodeSnapshot: "COMMON" }) as never },
    design: { getCurrentProjectDesign: async () => (options.design === null ? null : ({ projectId: FIXTURE_PROJECT_ID, templateVersionId: options.design ?? VH_VERSION }) as never) },
    templateVersions: { getTemplateVersionBinding: async (_c, id) => ({ id, rendererKey: options.rendererKey ?? "wedding.vietnamese-heritage.v1" }) },
    weddingDetails: { getWeddingDetailsByProjectId: async () => details() },
    events: { listProjectEvents: async () => EVENTS as never },
    media: { listProjectMedia: async () => options.media ?? [mediaRow(PHOTO_ID, "PHOTO"), mediaRow(FIXTURE_MEDIA_IDS.AUDIO, "AUDIO")] },
    timeline: { listProjectTimelineItems: async () => [] },
    dressCode: { getProjectDressCode: async () => null },
    templateSlots: { listSlotItems },
    lookupEditorManifest: lookupTemplateEditorManifest,
  } as EditorReadinessDependencies<string>;
  return { value, listSlotItems };
}

describe("loadEditorReadiness", () => {
  it("no design → legitimate BLOCKING result, not an error", async () => {
    const result = await loadEditorReadiness(FIXTURE_PROJECT_ID, STAFF, deps({ design: null }).value);
    expect(result.nextAction).toBe("Chọn mẫu thiệp");
  });

  it("reads slot rows for the exact current template version and counts them", async () => {
    const { value, listSlotItems } = deps({ rows: [{ slotKey: "portraitCluster", position: 0, projectMediaId: PHOTO_ID }] });
    const result = await loadEditorReadiness(FIXTURE_PROJECT_ID, STAFF, value);
    expect(listSlotItems).toHaveBeenCalledWith("client", FIXTURE_PROJECT_ID, VH_VERSION);
    expect(result.items.find((item) => item.key === "portraitCluster")?.message).toBe("Đã có 1/3 ảnh");
    expect(result.items.find((item) => item.key === "MUSIC")?.status).toBe("COMPLETE");
  });

  it("corrupted slot rows → TEMPLATE_MEDIA_INVALID, never repaired", async () => {
    const rows = [{ slotKey: "heroPhoto", position: 0, projectMediaId: FIXTURE_MEDIA_IDS.AUDIO }];
    const result = await loadEditorReadiness(FIXTURE_PROJECT_ID, STAFF, deps({ rows }).value);
    expect(result.items.find((item) => item.key === "TEMPLATE_MEDIA_INVALID")?.status).toBe("BLOCKING");
  });

  it("LEGACY_ROLES never reads slot rows; unknown renderer → UNSUPPORTED blocking", async () => {
    const legacy = deps({ rendererKey: "wedding.elegant-editorial.v1" });
    await loadEditorReadiness(FIXTURE_PROJECT_ID, STAFF, legacy.value);
    expect(legacy.listSlotItems).not.toHaveBeenCalled();
    const unknown = await loadEditorReadiness(FIXTURE_PROJECT_ID, STAFF, deps({ rendererKey: "wedding.unknown.v1" }).value);
    expect(unknown.overall).toBe("BLOCKING");
    expect(unknown.nextAction).toBe("Chọn mẫu thiệp khác");
  });

  it("a switched design reads only the new version's rows", async () => {
    const other = "00000000-0000-4000-8000-0000000000f2";
    const { value, listSlotItems } = deps({ design: other });
    await loadEditorReadiness(FIXTURE_PROJECT_ID, STAFF, value);
    expect(listSlotItems.mock.calls).toEqual([["client", FIXTURE_PROJECT_ID, other]]);
  });
});
