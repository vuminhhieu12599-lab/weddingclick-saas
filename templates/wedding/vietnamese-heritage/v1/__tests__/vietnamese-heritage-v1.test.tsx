import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS, type InvitationVariant } from "../../../../../lib/domain";
import { deriveEventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { RendererSelectionError, RendererSelectionInvariantError } from "../../../../../lib/invitation-rendering/renderer-selection-errors";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import type { BuildSnapshotPayloadInput, SnapshotMediaSource } from "../../../../../lib/invitation-rendering/snapshot-payload-types";
import { buildTemplateMediaSource } from "../../../../../lib/server/invitation-snapshot/build-template-media-source";
import type { TemplateMediaSlotItem } from "../../../../../lib/server/template-media/template-media-slot-types";
import { createFixtureMediaResolver, fixtureMediaUrl } from "../../../../core/fixtures/fixture-media-resolver";
import { runRendererFixturePipeline, type RendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import {
  FIXTURE_GUESTS,
  FIXTURE_MEDIA_IDS,
  FIXTURE_PHOTO_STORY_IDS,
  FIXTURE_PROJECT_ID,
  buildRendererFixtureSourceInput,
  type RendererFixtureSourceOptions,
} from "../../../../core/fixtures/renderer-fixture-sources";
import {
  PRODUCTION_COMPATIBILITY_REGISTRY,
  PRODUCTION_RENDERER_KEYS,
  createProductionCompatibilityRegistry,
} from "../../../../core/production-renderer-manifests";
import {
  RENDERER_PRODUCTION_MANIFEST_ERROR_MESSAGES as M,
  RendererProductionManifestInvariantError,
  composeProductionRendererKey,
  validateRendererProductionManifest,
} from "../../../../core/renderer-manifest";
import { VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST } from "../../../../editor/wedding/vietnamese-heritage-v1";
import { ELEGANT_EDITORIAL_V1_MANIFEST } from "../../../elegant-editorial/v1/manifest";
import { VIETNAMESE_HERITAGE_V1_MANIFEST } from "../manifest";

// next/font loaders only run under the Next compiler; `npm run build` proves the real configuration.
vi.mock("../fonts", () => ({ VIETNAMESE_HERITAGE_V1_FONT_VARIABLES_CLASS_NAME: "vh-test-font-variables" }));
vi.mock("../../../elegant-editorial/v1/fonts", () => ({
  ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables",
}));

const { VietnameseHeritageV1 } = await import("../vietnamese-heritage-v1");
const { ElegantEditorialV1 } = await import("../../../elegant-editorial/v1/elegant-editorial-v1");
const { InvitationRendererHost } = await import("../../../../core/invitation-renderer-host");
const { VIETNAMESE_HERITAGE_V1_COPY: COPY } = await import("../copy");

/**
 * VH-01 / VH-02A — Vietnamese Heritage v1 identity, compatibility, registry
 * coexistence, canonical mapping and TEMPLATE_SLOTS media (docs/DECISIONS.md
 * "VH-01 …", "VH-02A …"). Every ViewModel comes from the real pipeline:
 * canonical fixture records + slot rows → TE-04 `buildTemplateMediaSource`
 * (validated against the VH editor manifest) → RF-02 Snapshot → RF-03 media
 * resolution → InvitationViewModel → RF-04 selection. Slot data is never
 * hand-built into a ViewModel.
 */

const VH_KEY = "wedding.vietnamese-heritage.v1";
const EE_KEY = "wedding.elegant-editorial.v1";
const EMPTY: InvitationRendererCapabilitiesV1 = Object.freeze({});

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

/** Staff-library PHOTO rows assignable to template slots (TE-03A). */
const PHOTO = Object.freeze({
  P1: "00000000-0000-4000-8000-0000000004a1",
  P2: "00000000-0000-4000-8000-0000000004a2",
  P3: "00000000-0000-4000-8000-0000000004a3",
  P4: "00000000-0000-4000-8000-0000000004a4",
  P5: "00000000-0000-4000-8000-0000000004a5",
  P6: "00000000-0000-4000-8000-0000000004a6",
});

type SlotAssignments = Partial<Record<"heroPhoto" | "portraitCluster" | "loveStoryPhoto" | "gallery", readonly string[]>>;

/**
 * The default VH slot assignment: hero 1, cluster 3, love story 1, gallery 4.
 * Overlap is deliberate: P1 (hero) and P3 (cluster position 2) also sit in
 * the gallery, and GALLERY_2 is a legacy-typed row assigned explicitly.
 */
const VH_SLOTS: SlotAssignments = Object.freeze({
  heroPhoto: [PHOTO.P1],
  portraitCluster: [PHOTO.P2, PHOTO.P3, PHOTO.P4],
  loveStoryPhoto: [PHOTO.P5],
  gallery: [PHOTO.P6, PHOTO.P3, PHOTO.P1, FIXTURE_MEDIA_IDS.GALLERY_2],
});

function slotRows(assignments: SlotAssignments): TemplateMediaSlotItem[] {
  return Object.entries(assignments).flatMap(([slotKey, ids]) =>
    (ids ?? []).map((projectMediaId, position) => ({ slotKey, position, projectMediaId })),
  );
}

/**
 * The shared canonical fixture input, bound to the Vietnamese Heritage v1
 * identity and design keys, with the PHOTO rows added to the Project media
 * library. `slots` → TE-04 template media; `null` → a LEGACY_ROLES payload
 * (no `templateMedia`), used only to prove the renderer never reads legacy
 * layout roles.
 */
function vhSource(options: RendererFixtureSourceOptions, slots: SlotAssignments | null = VH_SLOTS): BuildSnapshotPayloadInput {
  const input = buildRendererFixtureSourceInput(options);
  const { design, compatibility } = VIETNAMESE_HERITAGE_V1_MANIFEST;
  const photos: SnapshotMediaSource[] = Object.values(PHOTO).map((id, index) => ({
    id,
    projectId: FIXTURE_PROJECT_ID,
    mediaType: "PHOTO",
    sortOrder: index,
  }));
  const media = [...input.media, ...photos];
  const source: BuildSnapshotPayloadInput = {
    ...input,
    media,
    design: {
      ...input.design,
      paletteKey: design.palettes[0] as string,
      fontPresetKey: design.fontPresets[0] as string,
      effectPresetKey: design.effectPresets[0] as string,
    },
    templateVersion: { ...input.templateVersion, rendererKey: compatibility.rendererKey },
  };
  return slots === null
    ? source
    : { ...source, templateMedia: buildTemplateMediaSource(VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST, slotRows(slots), media) };
}

interface VhRenderOptions extends RendererFixtureSourceOptions {
  guest?: { displayName: string };
  unavailableMediaIds?: readonly string[];
  /** Defaults to `VH_SLOTS`; `null` builds a LEGACY_ROLES payload. */
  slots?: SlotAssignments | null;
}

async function vhFixture(options: VhRenderOptions): Promise<RendererFixture> {
  const { guest, unavailableMediaIds, slots, ...sourceOptions } = options;
  return runRendererFixturePipeline(vhSource(sourceOptions, slots === undefined ? VH_SLOTS : slots), {
    resolver: createFixtureMediaResolver(unavailableMediaIds === undefined ? {} : { unavailableMediaIds }),
    ...(guest === undefined ? {} : { guest }),
  });
}

function render(viewModel: InvitationViewModel, sections: RendererEffectiveSections): string {
  return renderToStaticMarkup(<VietnameseHeritageV1 viewModel={viewModel} sections={sections} capabilities={EMPTY} />);
}

async function renderVh(options: VhRenderOptions): Promise<{ html: string; fixture: RendererFixture }> {
  const fixture = await vhFixture(options);
  return { html: render(fixture.viewModel, fixture.selection.effectiveSections), fixture };
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/** `src="<fixture url>"` of a media id (React may also hoist an eager image into a preload `<link>`). */
function src(mediaId: string): string {
  return `src="${fixtureMediaUrl(mediaId)}"`;
}

/** Media ids of every rendered fixture `<img src>`, in document order. */
function imageIds(html: string): string[] {
  const prefix = fixtureMediaUrl("");
  return [...html.matchAll(/<img [^>]*src="([^"]+)"/g)]
    .map((match) => match[1] as string)
    .filter((url) => url.startsWith(prefix))
    .map((url) => decodeURIComponent(url.slice(prefix.length)));
}

/** The portrait-cluster markup (empty when the cluster is omitted). */
function clusterOf(html: string): string {
  const start = html.indexOf("portraitRow");
  return start === -1 ? "" : html.slice(start, html.indexOf("inviteBlock", start));
}

/** Slot positions of the rendered portrait frames, in document order. */
function clusterPositions(html: string): string[] {
  return [...clusterOf(html).matchAll(/data-position="(\d)"/g)].map((match) => match[1] as string);
}

/** A deliberately mutable view of a manifest copy, for malformed-manifest cases only. */
interface MutableManifest {
  identity: { templateCode: string };
  compatibility: { rendererKey: string; supportedVariants: string[] };
  design: { palettes: string[]; sectionSettingsSchema: Record<string, { type: string }> };
}

function vhManifestCopy(): MutableManifest {
  return structuredClone(VIETNAMESE_HERITAGE_V1_MANIFEST) as unknown as MutableManifest;
}

type ManifestMutation = (manifest: MutableManifest) => void;

const ALL_MEDIA: VhRenderOptions = { variant: "COMMON", portraits: "PRESENT", photoStory: "PRESENT", loveStoryPhoto: "PRESENT" };

// ---------------------------------------------------------------------------
// A. Identity
// ---------------------------------------------------------------------------

describe("A. identity", () => {
  it("exact identity, renderer key and its P18 composition", () => {
    expect(VIETNAMESE_HERITAGE_V1_MANIFEST.identity).toStrictEqual({
      eventType: "WEDDING",
      templateCode: "vietnamese-heritage",
      versionNumber: 1,
      displayName: "Vietnamese Heritage",
    });
    expect(VIETNAMESE_HERITAGE_V1_MANIFEST.compatibility.rendererKey).toBe(VH_KEY);
    expect(composeProductionRendererKey(VIETNAMESE_HERITAGE_V1_MANIFEST.identity)).toBe(VH_KEY);
  });

  it("exact proposed design set: one palette, one font preset, STANDARD, boolean settings for capable sections only", () => {
    expect(VIETNAMESE_HERITAGE_V1_MANIFEST.design).toStrictEqual({
      schemaVersion: 1,
      palettes: ["heritage-vermilion"],
      fontPresets: ["heritage-classic"],
      effectPresets: ["STANDARD"],
      sectionSettingsSchema: {
        loveStory: { type: "boolean" },
        gallery: { type: "boolean" },
        music: { type: "boolean" },
        gift: { type: "boolean" },
        timeline: { type: "boolean" },
        dressCode: { type: "boolean" },
      },
      designSettingsSchema: {},
    });
  });

  it("validates under the frozen RF-06 rules into an equal fresh copy", () => {
    const validated = validateRendererProductionManifest(VIETNAMESE_HERITAGE_V1_MANIFEST);
    expect(validated).toStrictEqual(VIETNAMESE_HERITAGE_V1_MANIFEST);
    expect(validated).not.toBe(VIETNAMESE_HERITAGE_V1_MANIFEST);
  });

  it("Elegant Editorial's identity and manifest are untouched", () => {
    expect(ELEGANT_EDITORIAL_V1_MANIFEST.identity).toStrictEqual({
      eventType: "WEDDING",
      templateCode: "elegant-editorial",
      versionNumber: 1,
      displayName: "Elegant Editorial",
    });
    expect(ELEGANT_EDITORIAL_V1_MANIFEST.compatibility.rendererKey).toBe(EE_KEY);
    expect(ELEGANT_EDITORIAL_V1_MANIFEST.design.palettes).toStrictEqual(["green-ivory"]);
  });
});

// ---------------------------------------------------------------------------
// B. Compatibility
// ---------------------------------------------------------------------------

describe("B. compatibility", () => {
  it("payload schema [1], variants COMMON/GROOM/BRIDE, explicit section capabilities", () => {
    expect(VIETNAMESE_HERITAGE_V1_MANIFEST.compatibility).toStrictEqual({
      rendererKey: VH_KEY,
      supportedPayloadSchemaVersions: [1],
      supportedVariants: ["COMMON", "GROOM", "BRIDE"],
      sectionCapabilities: {
        invitationMessage: false,
        loveStory: true,
        gallery: true,
        music: true,
        gift: true,
        timeline: true,
        dressCode: true,
        photoStory: false,
      },
    });
  });

  it.each(INVITATION_VARIANTS)("%s selects Vietnamese Heritage through the production registry", async (variant) => {
    const { selection, viewModel } = await vhFixture({ variant, photoStory: "PRESENT" });
    expect(selection.rendererKey).toBe(VH_KEY);
    expect(viewModel.template.rendererKey).toBe(VH_KEY);
    // TEMPLATE_SLOTS never reads legacy PHOTO_STORY rows, and the section is not capable anyway.
    expect(viewModel.sections.photoStory).toBe(false);
    expect(selection.effectiveSections.photoStory).toBe(false);
    // Not capable: canonical content never becomes visible.
    expect(viewModel.sections.invitationMessage).toBe(true);
    expect(selection.effectiveSections.invitationMessage).toBe(false);
  });

  it("a registry without Vietnamese Heritage rejects its Snapshot (no fallback to Elegant Editorial)", async () => {
    const eeOnly = createProductionCompatibilityRegistry([ELEGANT_EDITORIAL_V1_MANIFEST]);
    await expect(
      runRendererFixturePipeline(vhSource({ variant: "GROOM" }), { resolver: createFixtureMediaResolver(), registry: eeOnly }),
    ).rejects.toThrow(RendererSelectionError);
  });

  const MALFORMED: readonly [string, ManifestMutation, string][] = [
    [
      "templateCode not kebab",
      (m) => {
        m.identity.templateCode = "Vietnamese-Heritage";
      },
      M.TEMPLATE_CODE,
    ],
    [
      "renderer key not the identity composition",
      (m) => {
        m.compatibility.rendererKey = "wedding.vietnamese-heritage.v2";
      },
      M.RENDERER_KEY_MISMATCH,
    ],
    [
      "setting for an incapable section",
      (m) => {
        m.design.sectionSettingsSchema.photoStory = { type: "boolean" };
      },
      M.SECTION_SETTING_CAPABILITY_MISMATCH,
    ],
    [
      "empty palette set",
      (m) => {
        m.design.palettes.length = 0;
      },
      M.DESIGN_EMPTY_KEY_SET,
    ],
  ];

  it.each(MALFORMED)("malformed manifest (%s) fails closed with a fixed RF-06 error", (_label, mutate, message) => {
    const broken = vhManifestCopy();
    mutate(broken);
    expect(() => validateRendererProductionManifest(broken)).toThrow(new RendererProductionManifestInvariantError(message));
  });

  it("an empty variant list fails closed with the RF-04 invariant error", () => {
    const broken = vhManifestCopy();
    broken.compatibility.supportedVariants = [];
    expect(() => validateRendererProductionManifest(broken)).toThrow(RendererSelectionInvariantError);
  });

  it.each([
    "wedding.vietnamese-heritage.v2",
    "wedding.vietnamese-heritage.v0",
    "wedding.vietnamese-heritage",
    "wedding.vietnamese-heritage.latest",
    "Wedding.vietnamese-heritage.v1",
    " wedding.vietnamese-heritage.v1",
    "vietnamese-heritage",
    "Vietnamese Heritage",
    "wedding.heritage-vermilion.v1",
  ])("unknown key %j is not registered (no normalization, alias or latest)", (key) => {
    expect(PRODUCTION_COMPATIBILITY_REGISTRY.compatibility.lookup(key)).toBeUndefined();
    expect(PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(key)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// C. Registry coexistence
// ---------------------------------------------------------------------------

describe("C. registry coexistence", () => {
  it("both production renderers are registered, Elegant Editorial first and unchanged", () => {
    expect(PRODUCTION_RENDERER_KEYS).toStrictEqual([EE_KEY, VH_KEY]);
    expect(PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(EE_KEY)).toStrictEqual(ELEGANT_EDITORIAL_V1_MANIFEST);
    expect(PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(VH_KEY)).toStrictEqual(VIETNAMESE_HERITAGE_V1_MANIFEST);
  });

  it("the production client host resolves each key to its own renderer", async () => {
    const vh = await vhFixture({ variant: "BRIDE" });
    const vhHtml = renderToStaticMarkup(
      <InvitationRendererHost rendererKey={VH_KEY} viewModel={vh.viewModel} sections={vh.selection.effectiveSections} />,
    );
    expect(vhHtml).toContain('data-renderer="vietnamese-heritage-v1"');
    expect(vhHtml).not.toContain("elegant-editorial-v1");

    const ee = await runRendererFixturePipeline(buildRendererFixtureSourceInput({ variant: "BRIDE" }), {
      resolver: createFixtureMediaResolver(),
    });
    expect(ee.selection.rendererKey).toBe(EE_KEY);
    const eeHtml = renderToStaticMarkup(
      <InvitationRendererHost rendererKey={EE_KEY} viewModel={ee.viewModel} sections={ee.selection.effectiveSections} />,
    );
    expect(eeHtml).toContain('data-renderer="elegant-editorial-v1"');
    expect(eeHtml).not.toContain("vietnamese-heritage-v1");
    expect(renderToStaticMarkup(<ElegantEditorialV1 viewModel={ee.viewModel} sections={ee.selection.effectiveSections} capabilities={EMPTY} />)).toContain(
      "ee-test-font-variables",
    );
  });
});

// ---------------------------------------------------------------------------
// E. Canonical mapping
// ---------------------------------------------------------------------------

describe("E. canonical mapping", () => {
  it("renderer root: scoped fonts, palette and variant; one <main>, one <h1>", async () => {
    const { html } = await renderVh({ variant: "COMMON" });
    expect(html).toContain('data-renderer="vietnamese-heritage-v1"');
    expect(html).toContain('data-variant="COMMON"');
    expect(html).toContain("vh-test-font-variables");
    expect(html).toContain("--vh-vermilion:#9c2b34");
    expect(count(html, "<main")).toBe(1);
    expect(count(html, "<h1")).toBe(1);
  });

  it("names: primary before secondary in the opening, hero and closing, full canonical names", async () => {
    for (const variant of INVITATION_VARIANTS) {
      const { html, fixture } = await renderVh({ variant });
      const { primary, secondary } = fixture.viewModel.people;
      const h1 = html.slice(html.indexOf("<h1"), html.indexOf("</h1>"));
      expect(h1.indexOf(primary.name), variant).toBeGreaterThan(-1);
      expect(h1.indexOf(primary.name), variant).toBeLessThan(h1.indexOf(secondary.name));
      expect(count(html, primary.name), variant).toBeGreaterThanOrEqual(3);
    }
    const groom = await renderVh({ variant: "GROOM" });
    const bride = await renderVh({ variant: "BRIDE" });
    const h1Of = (html: string) => html.slice(html.indexOf("<h1"), html.indexOf("</h1>"));
    expect(h1Of(groom.html).indexOf("Nguyễn Minh Khôi")).toBeLessThan(h1Of(groom.html).indexOf("Trần Ngọc Hân"));
    expect(h1Of(bride.html).indexOf("Trần Ngọc Hân")).toBeLessThan(h1Of(bride.html).indexOf("Nguyễn Minh Khôi"));
  });

  it("ceremony title comes from canonical data: GROOM never shows Vu Quy, BRIDE never shows Thành Hôn", async () => {
    const groom = await renderVh({ variant: "GROOM" });
    expect(groom.fixture.viewModel.ceremony.title).toBe("Lễ Thành Hôn");
    expect(groom.html).toContain("Lễ Thành Hôn");
    expect(groom.html).not.toMatch(/Vu Quy/i);
    const bride = await renderVh({ variant: "BRIDE" });
    expect(bride.fixture.viewModel.ceremony.title).toBe("Lễ Vu Quy");
    expect(bride.html).toContain("Lễ Vu Quy");
    expect(bride.html).not.toMatch(/Thành Hôn/i);
    const common = await renderVh({ variant: "COMMON" });
    expect(common.html).toContain(common.fixture.viewModel.ceremony.title);
  });

  it("ceremony date/time/weekday derive from the canonical ceremony (Asia/Ho_Chi_Minh)", async () => {
    const { html } = await renderVh({ variant: "GROOM" });
    // 2026-10-18T02:00:00Z = Chủ Nhật 18.10.2026 09:00 in Asia/Ho_Chi_Minh.
    expect(html).toContain("Chủ Nhật");
    expect(html).toContain("18.10.2026");
    expect(html).toContain("09:00");
    const dayCell = html.slice(html.indexOf("riteDayCell"), html.indexOf("riteDayCell") + 400);
    expect(dayCell).toMatch(/>18<\/span>/);
    expect(dayCell.replace(/<!-- -->/g, "")).toContain("Tháng 10");
  });

  it("lunar text is the verbatim ceremony value beside the label, once, and omitted when absent", async () => {
    const present = await renderVh({ variant: "GROOM" });
    expect(count(present.html, "08/09 Âm Lịch")).toBe(1);
    expect(present.html).toContain('data-lunar="present"');
    const bride = await renderVh({ variant: "BRIDE" });
    expect(count(bride.html, "07/09 Âm Lịch")).toBe(1);
    expect(bride.html).not.toContain("08/09 Âm Lịch");
    const absent = await renderVh({ variant: "GROOM", ceremonyLunar: "ABSENT" });
    expect(absent.html).not.toContain('data-lunar="present"');
    expect(absent.html).not.toContain(COPY.ceremonial.lunarLabel);
  });

  it("family columns follow primary/secondary with labels from the explicit side", async () => {
    const order = (html: string) => [...html.matchAll(/class="[^"]*familyColumn[^"]*" data-side="(\w+)"/g)].map((match) => match[1]);
    const groom = await renderVh({ variant: "GROOM" });
    expect(order(groom.html)).toStrictEqual(["GROOM", "BRIDE"]);
    const bride = await renderVh({ variant: "BRIDE" });
    expect(order(bride.html)).toStrictEqual(["BRIDE", "GROOM"]);
    const brideFirst = bride.html.slice(bride.html.indexOf('data-side="BRIDE"'));
    expect(brideFirst.indexOf("Nhà Gái")).toBeLessThan(brideFirst.indexOf("Nhà Trai"));
    for (const value of ["Nguyễn Văn Đức", "Phạm Thị Hồng", "Trần Quốc Việt", "Lê Thị Thu Hương", "12 Đường Hoa Sữa"]) {
      expect(groom.html).toContain(value);
    }
  });

  it("a family with null lines is omitted honestly, never with an empty label", async () => {
    const input = vhSource({ variant: "COMMON" });
    const details = input.weddingDetails as NonNullable<BuildSnapshotPayloadInput["weddingDetails"]>;
    input.weddingDetails = { ...details, brideFather: null, brideMother: null, brideFamilyAddress: null };
    const fixture = await runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver() });
    const html = render(fixture.viewModel, fixture.selection.effectiveSections);
    expect(html).toMatch(/familyColumns[^"]*" data-count="1"/);
    expect(html).not.toMatch(/familyColumn[^"]*" data-side="BRIDE"/);
  });

  it("guest line: the authorized overlay verbatim (normal, long, playful), else the fixed default", async () => {
    for (const guest of Object.values(FIXTURE_GUESTS)) {
      const { html } = await renderVh({ variant: "COMMON", guest });
      expect(html).toContain(guest.displayName);
      expect(html).toContain('data-guest="personalized"');
      expect(html).not.toContain(`>${COPY.ceremonial.defaultGuest}<`);
    }
    const { html } = await renderVh({ variant: "COMMON" });
    expect(html).toContain(`>${COPY.ceremonial.defaultGuest}<`);
    expect(html).toContain('data-guest="default"');
    expect(html).toContain(COPY.ceremonial.salutation);
  });

  it("VH-02A ruling D3: exact generic guest and salutation copy; a personalized display name is verbatim", async () => {
    expect(COPY.ceremonial.defaultGuest).toBe("Bạn và Gia Đình");
    expect(COPY.ceremonial.salutation).toBe("Trân Trọng Kính Mời");
    const generic = await renderVh({ variant: "BRIDE" });
    expect(generic.html).toContain(">Bạn và Gia Đình</p>");
    expect(generic.html).toContain(">Trân Trọng Kính Mời</p>");
    const playful = await renderVh({ variant: "GROOM", guest: { displayName: "Em và sự cô đơn" } });
    expect(playful.html).toContain(">Em và sự cô đơn</p>");
    expect(playful.html).not.toContain("Bạn và Gia Đình");
    expect(playful.html).toContain(">Trân Trọng Kính Mời</p>");
  });

  it("the canonical invitation message is never rendered (not capable)", async () => {
    const { html, fixture } = await renderVh({ variant: "COMMON" });
    expect(fixture.viewModel.content.invitationMessage).not.toBeNull();
    expect(html).not.toContain(fixture.viewModel.content.invitationMessage as string);
  });

  it("venue cards are exactly ceremonyCards: titles, venues, map links; side labels only with several cards; no lunar on cards", async () => {
    const common = await renderVh({ variant: "COMMON" });
    const cards = common.fixture.viewModel.ceremonyCards;
    expect(cards.map((card) => card.side)).toStrictEqual(["GROOM", "BRIDE"]);
    const venueSides = [...common.html.matchAll(/<li class="[^"]*venueBlock[^"]*" data-side="(\w+)"/g)].map((match) => match[1]);
    expect(venueSides).toStrictEqual(["GROOM", "BRIDE"]);
    expect(common.html).toContain("Tư gia nhà trai");
    expect(common.html).toContain('href="https://maps.example.invalid/groom-home"');
    expect(common.html).toContain('href="https://maps.example.invalid/bride-home"');
    // Non-card canonical events are not cards here.
    expect(common.html).not.toContain("Trung tâm Hội nghị Hoa Sữa");
    const groom = await renderVh({ variant: "GROOM" });
    expect([...groom.html.matchAll(/venueBlock[^"]*" data-side="(\w+)"/g)].map((match) => match[1])).toStrictEqual(["GROOM"]);
    expect(groom.html).not.toMatch(/class="[^"]*venueSide/);
  });

  it("VH-02A ruling D4: venue card title from the explicit side; canonical event and card titles unchanged", async () => {
    expect(COPY.events.cardTitleBySide).toStrictEqual({ GROOM: "Tiệc mừng lễ thành hôn", BRIDE: "Tiệc mừng lễ vu quy" });
    const titles = (html: string) => [...html.matchAll(/class="[^"]*venueTitle[^"]*">([^<]+)</g)].map((match) => match[1]);
    const common = await renderVh({ variant: "COMMON" });
    expect(titles(common.html)).toStrictEqual(["Tiệc mừng lễ thành hôn", "Tiệc mừng lễ vu quy"]);
    expect(titles((await renderVh({ variant: "GROOM" })).html)).toStrictEqual(["Tiệc mừng lễ thành hôn"]);
    const bride = await renderVh({ variant: "BRIDE" });
    expect(titles(bride.html)).toStrictEqual(["Tiệc mừng lễ vu quy"]);
    // Presentation only: the ViewModel and the canonical input keep their own titles.
    const cards = common.fixture.viewModel.ceremonyCards;
    expect(cards.map((card) => card.title)).toStrictEqual(["Lễ Thành Hôn", "Lễ Vu Quy"]);
    expect(cards.map((card) => card.event.title)).toStrictEqual(["Lễ Thành Hôn tại tư gia nhà trai", "Lễ Vu Quy tại tư gia nhà gái"]);
    const sourceTitles = vhSource({ variant: "COMMON" }).events.map((event) => event.title);
    expect(sourceTitles).toContain("Lễ Thành Hôn tại tư gia nhà trai");
    expect(sourceTitles).toContain("Lễ Vu Quy tại tư gia nhà gái");
    expect(bride.fixture.viewModel.ceremony.title).toBe("Lễ Vu Quy");
    // Canonical venue, address and map stay.
    expect(common.html).toContain("Tư gia nhà trai");
    expect(common.html).toContain('href="https://maps.example.invalid/bride-home"');
  });

  it("timeline: canonical steps in order when effective; hidden by staff setting or absence", async () => {
    const { html } = await renderVh({ variant: "COMMON" });
    const welcome = html.indexOf("Đón khách");
    expect(welcome).toBeGreaterThan(-1);
    expect(welcome).toBeLessThan(html.indexOf("Làm lễ"));
    expect(html.indexOf("Làm lễ")).toBeLessThan(html.indexOf("Khai tiệc"));
    expect((await renderVh({ variant: "COMMON", timeline: "ABSENT" })).html).not.toContain("Đón khách");
    expect((await renderVh({ variant: "COMMON", sectionSettings: { timeline: false } })).html).not.toContain("Đón khách");
  });

  it("semantic media: both QR codes render; PHOTO_STORY and audio never become elements", async () => {
    const { html, fixture } = await renderVh(ALL_MEDIA);
    expect(html).toContain(src(FIXTURE_MEDIA_IDS.QR_GROOM));
    expect(html).toContain(src(FIXTURE_MEDIA_IDS.QR_BRIDE));
    // TEMPLATE_SLOTS: legacy PHOTO_STORY rows are never frozen, never rendered, never reused.
    expect(fixture.viewModel.media.photoStory).toStrictEqual([]);
    for (const id of FIXTURE_PHOTO_STORY_IDS) expect(html).not.toContain(fixtureMediaUrl(id));
    // The audio reference never becomes an element (VH-02B owns music).
    expect(fixture.viewModel.media.audio?.mediaId).toBe(FIXTURE_MEDIA_IDS.AUDIO);
    expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.AUDIO));
    expect(html).not.toMatch(/<audio|<button|<form|<dialog/);
  });

  it("gift: one panel per operational side with canonical lines; GROOM shows only the groom side", async () => {
    const common = await renderVh({ variant: "COMMON" });
    expect([...common.html.matchAll(/giftPanel[^"]*" data-side="(\w+)"/g)].map((match) => match[1])).toStrictEqual(["GROOM", "BRIDE"]);
    const groom = await renderVh({ variant: "GROOM" });
    expect(groom.html).toContain("9001000000001");
    expect(groom.html).not.toContain("9001000000002");
    expect(groom.html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.QR_BRIDE));
    // Task 029 labels the single side too ("giftSideLabel"), from the explicit side.
    expect([...groom.html.matchAll(/class="[^"]*giftSide[^"]*">([^<]+)</g)].map((match) => match[1])).toStrictEqual(["Nhà Trai"]);
    const bride = await renderVh({ variant: "BRIDE" });
    expect([...bride.html.matchAll(/class="[^"]*giftSide[^"]*">([^<]+)</g)].map((match) => match[1])).toStrictEqual(["Nhà Gái"]);
  });

  it("staff section settings hide optional sections; RF-04 alone decides", async () => {
    const { html, fixture } = await renderVh({
      ...ALL_MEDIA,
      sectionSettings: { loveStory: false, gallery: false, gift: false, dressCode: false, timeline: false },
    });
    const sections = fixture.selection.effectiveSections;
    expect([sections.loveStory, sections.gallery, sections.gift, sections.dressCode, sections.timeline]).toStrictEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(html).not.toContain(fixtureMediaUrl(PHOTO.P6));
    expect(html).not.toContain(fixtureMediaUrl(PHOTO.P5));
    expect(html).not.toMatch(/data-island="gallery"/);
    expect(html).not.toContain("9001000000001");
    expect(html).not.toContain("#caa06a");
    expect(html).not.toContain(COPY.loveStory.heading);
    // Core canonical content stays.
    expect(html).toContain(fixture.viewModel.people.primary.name);
    expect(html).toContain(fixture.viewModel.ceremony.title);
  });

  it("love story and dress code: canonical text and every swatch in order", async () => {
    const { html } = await renderVh({ variant: "COMMON" });
    expect(html).toContain("Chúng tôi gặp nhau vào một chiều mưa.\nBa năm sau");
    const swatches = [...html.matchAll(/background-color:(#[0-9a-f]{6})/g)].map((match) => match[1]);
    expect(swatches).toStrictEqual(["#caa06a", "#7c5c42", "#e8dcc8", "#3d352b"]);
    expect((await renderVh({ variant: "COMMON", dressCode: "ABSENT" })).html).not.toContain(COPY.dressCode.heading);
  });

  it("no demo, prototype or capability UI appears; decor comes only from the v1 renderer path", async () => {
    const { html } = await renderVh(ALL_MEDIA);
    for (const forbidden of ["/prototypes/", "demo", "Sơn Trà", "sông Hàn", "A Thousand Years", "Xác Nhận Tham Dự", "Sao chép", "囍"]) {
      expect(html, forbidden).not.toContain(forbidden);
    }
    const decor = [...html.matchAll(/\/renderers\/[^"')\s&]+/g)].map((match) => match[0]);
    expect(decor.length).toBeGreaterThan(0);
    for (const path of decor) expect(path).toMatch(/^\/renderers\/wedding\/vietnamese-heritage\/v1\/[a-z-]+\.webp$/);
    expect(new Set(decor.map((path) => path.split("/").pop()))).toStrictEqual(
      new Set([
        "paper-red.webp",
        "paper-ivory.webp",
        "border-left.webp",
        "border-right.webp",
        "medallion-double-happiness.webp",
        "floral-top-left.webp",
        "floral-bottom-right.webp",
        "gold-divider.webp",
      ]),
    );
    expect(html).not.toMatch(/lantern|corner-ornament/);
    // Static VH-02A: the closed door is art only; no tap target, timer or interactive island yet.
    expect(html).toContain('data-opening="closed"');
    expect(html).not.toMatch(/<button|<form|<dialog|onclick|tabindex/i);
  });

  it("Song Hỷ: deterministic vector marks with an accessible name, never a font glyph; medallion raster only on opening/hero", async () => {
    const { html } = await renderVh(ALL_MEDIA);
    expect(html).not.toContain("囍");
    expect(html).not.toMatch(/<text\b/);
    const marks = [...html.matchAll(/role="img" aria-label="Song Hỷ"><svg[^>]*aria-hidden="true"/g)];
    expect(marks).toHaveLength(2);
    // The medallion artwork: opening cover + hero seal, each named.
    const medallions = [...html.matchAll(/<img [^>]*>/g)].map((match) => match[0]).filter((tag) => tag.includes("medallion-double-happiness.webp"));
    expect(medallions).toHaveLength(2);
    for (const tag of medallions) expect(tag).toContain('alt="Song Hỷ"');
    expect(html.indexOf("medallion-double-happiness.webp", html.indexOf("<footer"))).toBe(-1);
  });

  it("VH-02A ruling D5: the closing is text only with the exact three lines, canonical names and date", async () => {
    expect(COPY.closing.message).toStrictEqual([
      "Sự hiện diện của bạn là niềm hạnh phúc trọn vẹn",
      "nhất trong ngày cưới của chúng tôi.",
      "Xin chân thành cảm ơn.",
    ]);
    for (const variant of INVITATION_VARIANTS) {
      const { html, fixture } = await renderVh({ ...ALL_MEDIA, variant });
      const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
      const lines = [...footer.matchAll(/class="[^"]*closingLine[^"]*">([^<]+)</g)].map((match) => match[1]);
      expect(lines, variant).toStrictEqual([...COPY.closing.message]);
      const { primary, secondary } = fixture.viewModel.people;
      expect(footer.indexOf(primary.name), variant).toBeGreaterThan(footer.lastIndexOf("Xin chân thành cảm ơn."));
      expect(footer.indexOf(primary.name), variant).toBeLessThan(footer.indexOf(secondary.name));
      const date = deriveEventDateTimePresentationV1(fixture.viewModel.ceremony);
      expect(footer, variant).toContain(`${date.day}.${date.month}.${date.year}`);
      // No photo of any role: no media <img>, only vector marks.
      expect(footer, variant).not.toMatch(/<img/);
    }
  });
});

// ---------------------------------------------------------------------------
// F. Determinism across all three variants
// ---------------------------------------------------------------------------

describe("F. deterministic rendering for COMMON / GROOM / BRIDE", () => {
  it.each(INVITATION_VARIANTS)("%s renders identically from two independent pipeline runs", async (variant: InvitationVariant) => {
    const first = await renderVh({ ...ALL_MEDIA, variant, guest: FIXTURE_GUESTS.LONG });
    const second = await renderVh({ ...ALL_MEDIA, variant, guest: FIXTURE_GUESTS.LONG });
    expect(first.html).toBe(second.html);
    expect(first.html).toContain(`data-variant="${variant}"`);
  });

  it("the three variants differ only through canonical data", async () => {
    const [common, groom, bride] = await Promise.all(INVITATION_VARIANTS.map((variant) => renderVh({ variant })));
    expect(new Set([common?.html, groom?.html, bride?.html]).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// G. VH-02A TEMPLATE_SLOTS media (heroPhoto / portraitCluster / loveStoryPhoto / gallery)
// ---------------------------------------------------------------------------

describe("G. template slots", () => {
  it("the pipeline freezes exactly the four declared slots and no legacy layout roles", async () => {
    const { snapshot, viewModel } = await vhFixture(ALL_MEDIA);
    expect(snapshot.media.templateSlots).toStrictEqual({
      gallery: [PHOTO.P6, PHOTO.P3, PHOTO.P1, FIXTURE_MEDIA_IDS.GALLERY_2],
      heroPhoto: [PHOTO.P1],
      loveStoryPhoto: [PHOTO.P5],
      portraitCluster: [PHOTO.P2, PHOTO.P3, PHOTO.P4],
    });
    expect(Object.keys(viewModel.media.templateSlots ?? {}).sort()).toStrictEqual(["gallery", "heroPhoto", "loveStoryPhoto", "portraitCluster"]);
    // The Project library still holds COVER / PORTRAIT / LOVE_STORY_PHOTO / GALLERY rows; none is frozen as a role.
    expect(viewModel.media.cover).toBeUndefined();
    expect(viewModel.media.portrait).toStrictEqual({});
    expect(viewModel.media.loveStoryPhoto).toBeUndefined();
    expect(viewModel.media.gallery).toStrictEqual([]);
  });

  it("every rendered layout photo comes from its own slot, overlap included, in document order", async () => {
    const { html } = await renderVh(ALL_MEDIA);
    expect(imageIds(html)).toStrictEqual([
      PHOTO.P1, // hero
      PHOTO.P2, // cluster 1
      PHOTO.P3, // cluster 2
      PHOTO.P4, // cluster 3
      PHOTO.P5, // love story
      FIXTURE_MEDIA_IDS.QR_GROOM,
      FIXTURE_MEDIA_IDS.QR_BRIDE,
      PHOTO.P6, // gallery 1
      PHOTO.P3, // gallery 2 (also cluster 2)
      PHOTO.P1, // gallery 3 (also hero)
      FIXTURE_MEDIA_IDS.GALLERY_2, // gallery 4
    ]);
    for (const id of [FIXTURE_MEDIA_IDS.COVER, FIXTURE_MEDIA_IDS.PORTRAIT_GROOM, FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE, FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO]) {
      expect(html, id).not.toContain(fixtureMediaUrl(id));
    }
  });

  it("legacy-role media never reaches the layout: a LEGACY_ROLES payload with every legacy role renders no layout photo", async () => {
    const { html, fixture } = await renderVh({ ...ALL_MEDIA, slots: null });
    // The legacy roles are populated in this ViewModel…
    expect(fixture.viewModel.media.cover?.status).toBe("RESOLVED");
    expect(fixture.viewModel.media.portrait.groom?.status).toBe("RESOLVED");
    expect(fixture.viewModel.media.loveStoryPhoto?.status).toBe("RESOLVED");
    expect(fixture.viewModel.media.gallery).toHaveLength(3);
    expect(fixture.viewModel.media.templateSlots).toBeUndefined();
    // …and the renderer ignores every one of them; only the semantic QR codes render.
    expect(imageIds(html)).toStrictEqual([FIXTURE_MEDIA_IDS.QR_GROOM, FIXTURE_MEDIA_IDS.QR_BRIDE]);
    expect(html).toContain('data-hero-photo="none"');
    expect(clusterOf(html)).toBe("");
    expect(html).toContain('data-photo="none"');
    // The gallery section is effective (legacy rows), but its slot is empty: an empty album, never a legacy fallback.
    expect(html).not.toMatch(/data-status="RESOLVED"/);
  });

  describe("heroPhoto", () => {
    it("RESOLVED renders the framed hero photo", async () => {
      const { html } = await renderVh(ALL_MEDIA);
      expect(html).toContain('data-hero-photo="present"');
      const hero = html.slice(html.indexOf("data-hero-photo"), html.indexOf('id="vh-hero-names"'));
      expect(hero).toContain(src(PHOTO.P1));
      expect(hero).toMatch(/heroPhotoFrame/);
    });

    it("UNAVAILABLE renders no image and no substitute (never COVER, never another slot)", async () => {
      const { html } = await renderVh({ ...ALL_MEDIA, slots: { ...VH_SLOTS, gallery: [PHOTO.P6] }, unavailableMediaIds: [PHOTO.P1] });
      expect(html).toContain('data-hero-photo="none"');
      expect(html).not.toContain(fixtureMediaUrl(PHOTO.P1));
      expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.COVER));
      const hero = html.slice(html.indexOf("data-hero-photo"), html.indexOf('id="vh-hero-names"'));
      expect(hero).not.toMatch(/heroPhotoFrame/);
      expect(hero).toContain("medallion-double-happiness.webp");
    });

    it("an empty slot is an honest typographic hero", async () => {
      const { html } = await renderVh({ ...ALL_MEDIA, slots: { ...VH_SLOTS, heroPhoto: [] } });
      expect(html).toContain('data-hero-photo="none"');
      expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.COVER));
    });
  });

  describe("portraitCluster (positions, never people)", () => {
    it("3 RESOLVED: exactly three frames in slot order 1 / 2 / 3, position 2 the dominant centre", async () => {
      const { html } = await renderVh(ALL_MEDIA);
      const cluster = clusterOf(html);
      expect(cluster).toMatch(/^portraitRow[^"]*" data-count="3"/);
      expect(count(cluster, "<figure")).toBe(3);
      expect(clusterPositions(html)).toStrictEqual(["1", "2", "3"]);
      expect(imageIds(cluster)).toStrictEqual([PHOTO.P2, PHOTO.P3, PHOTO.P4]);
      expect([...cluster.matchAll(/data-position="(\d)" data-emphasis="center"/g)].map((match) => match[1])).toStrictEqual(["2"]);
      expect(count(cluster, "data-emphasis")).toBe(1);
    });

    it("2 RESOLVED: a balanced pair, no fake third frame, no centre emphasis", async () => {
      const { html } = await renderVh({ ...ALL_MEDIA, slots: { ...VH_SLOTS, portraitCluster: [PHOTO.P2, PHOTO.P4] } });
      const cluster = clusterOf(html);
      expect(cluster).toMatch(/^portraitRow[^"]*" data-count="2"/);
      expect(count(cluster, "<figure")).toBe(2);
      expect(imageIds(cluster)).toStrictEqual([PHOTO.P2, PHOTO.P4]);
      expect(cluster).not.toContain("data-emphasis");
    });

    it("1 RESOLVED: exactly one centred frame", async () => {
      const { html } = await renderVh({ ...ALL_MEDIA, slots: { ...VH_SLOTS, portraitCluster: [PHOTO.P4] } });
      const cluster = clusterOf(html);
      expect(cluster).toMatch(/^portraitRow[^"]*" data-count="1"/);
      expect(count(cluster, "<figure")).toBe(1);
      expect(imageIds(cluster)).toStrictEqual([PHOTO.P4]);
      expect(cluster).not.toContain("data-emphasis");
    });

    it("0 RESOLVED: no cluster (empty slot, or every item UNAVAILABLE)", async () => {
      const empty = await renderVh({ ...ALL_MEDIA, slots: { ...VH_SLOTS, portraitCluster: [] } });
      expect(clusterOf(empty.html)).toBe("");
      const gone = await renderVh({
        ...ALL_MEDIA,
        slots: { ...VH_SLOTS, gallery: [PHOTO.P6] },
        unavailableMediaIds: [PHOTO.P2, PHOTO.P3, PHOTO.P4],
      });
      expect(clusterOf(gone.html)).toBe("");
      for (const id of [PHOTO.P2, PHOTO.P3, PHOTO.P4]) expect(gone.html).not.toContain(fixtureMediaUrl(id));
    });

    it("UNAVAILABLE centre: positions 1 and 3 render as the balanced pair, with no substitution", async () => {
      const { html } = await renderVh({ ...ALL_MEDIA, slots: { ...VH_SLOTS, gallery: [PHOTO.P6] }, unavailableMediaIds: [PHOTO.P3] });
      const cluster = clusterOf(html);
      expect(cluster).toMatch(/^portraitRow[^"]*" data-count="2"/);
      expect(clusterPositions(html)).toStrictEqual(["1", "3"]);
      expect(imageIds(cluster)).toStrictEqual([PHOTO.P2, PHOTO.P4]);
      expect(cluster).not.toContain("data-emphasis");
      expect(html).not.toContain(fixtureMediaUrl(PHOTO.P3));
      // Nothing else from the library fills the gap.
      for (const id of [PHOTO.P1, PHOTO.P5, PHOTO.P6, FIXTURE_MEDIA_IDS.COVER, FIXTURE_MEDIA_IDS.PORTRAIT_GROOM]) {
        expect(imageIds(cluster), id).not.toContain(id);
      }
    });

    it("three couple photos: no frame is labelled groom / couple / bride in markup or alt text", async () => {
      const { html } = await renderVh({ ...ALL_MEDIA, variant: "BRIDE" });
      const cluster = clusterOf(html);
      expect(cluster).not.toMatch(/groom|bride|couple|GROOM|BRIDE|COUPLE|data-side|chú rể|cô dâu|Chú rể|Cô dâu/);
      const alts = [...cluster.matchAll(/alt="([^"]*)"/g)].map((match) => match[1]);
      expect(alts).toStrictEqual(["Ảnh cưới, khung 1", "Ảnh cưới, khung 2", "Ảnh cưới, khung 3"]);
      for (const name of ["Nguyễn Minh Khôi", "Trần Ngọc Hân"]) expect(cluster).not.toContain(name);
    });

    it("COMMON / GROOM / BRIDE share the same slot image sequence (BRIDE never reorders)", async () => {
      const sequences = await Promise.all(
        INVITATION_VARIANTS.map(async (variant) => imageIds(clusterOf((await renderVh({ ...ALL_MEDIA, variant })).html))),
      );
      for (const sequence of sequences) expect(sequence).toStrictEqual([PHOTO.P2, PHOTO.P3, PHOTO.P4]);
      const pair = await Promise.all(
        INVITATION_VARIANTS.map(async (variant) =>
          clusterPositions((await renderVh({ ...ALL_MEDIA, variant, slots: { ...VH_SLOTS, gallery: [PHOTO.P6] }, unavailableMediaIds: [PHOTO.P2] })).html),
        ),
      );
      for (const positions of pair) expect(positions).toStrictEqual(["2", "3"]);
    });
  });

  describe("loveStoryPhoto", () => {
    it("RESOLVED renders the photo in the text-driven section", async () => {
      const { html } = await renderVh(ALL_MEDIA);
      const story = html.slice(html.indexOf("vh-love-story-heading") - 200, html.indexOf("loveStoryText"));
      expect(story).toContain('data-photo="present"');
      expect(story).toContain(src(PHOTO.P5));
      expect(html).toContain("Chúng tôi gặp nhau vào một chiều mưa.");
    });

    it("UNAVAILABLE or empty: text only, never the legacy LOVE_STORY_PHOTO", async () => {
      for (const options of [
        { ...ALL_MEDIA, unavailableMediaIds: [PHOTO.P5] },
        { ...ALL_MEDIA, slots: { ...VH_SLOTS, loveStoryPhoto: [] } },
      ]) {
        const { html } = await renderVh(options);
        expect(html).toContain('data-photo="none"');
        expect(html).toContain(COPY.loveStory.heading);
        expect(html).toContain("Chúng tôi gặp nhau vào một chiều mưa.");
        expect(html).not.toContain(fixtureMediaUrl(PHOTO.P5));
        expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO));
      }
    });

    it("a photo alone never creates the section: no canonical text → no Love Story", async () => {
      const input = vhSource(ALL_MEDIA);
      const details = input.weddingDetails as NonNullable<BuildSnapshotPayloadInput["weddingDetails"]>;
      input.weddingDetails = { ...details, loveStory: null };
      const fixture = await runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver() });
      expect(fixture.selection.effectiveSections.loveStory).toBe(false);
      const html = render(fixture.viewModel, fixture.selection.effectiveSections);
      expect(html).not.toContain(COPY.loveStory.heading);
      expect(html).not.toContain(fixtureMediaUrl(PHOTO.P5));
    });
  });

  describe("gallery", () => {
    const tiles = (html: string) => [...html.matchAll(/albumPrint[^"]*" data-status="(\w+)" data-index="(\d+)"/g)].map((match) => `${match[2]}:${match[1]}`);

    it("exact frozen slot order, never the legacy GALLERY rows", async () => {
      const { html } = await renderVh(ALL_MEDIA);
      expect(tiles(html)).toStrictEqual(["0:RESOLVED", "1:RESOLVED", "2:RESOLVED", "3:RESOLVED"]);
      const album = html.slice(html.indexOf('data-island="gallery"'));
      expect(imageIds(album)).toStrictEqual([PHOTO.P6, PHOTO.P3, PHOTO.P1, FIXTURE_MEDIA_IDS.GALLERY_2]);
      expect(album).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.GALLERY_1));
      expect(album).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.GALLERY_3));
    });

    it("UNAVAILABLE keeps its position as one neutral tile; nothing is dropped, reordered or substituted", async () => {
      const { html } = await renderVh({ ...ALL_MEDIA, slots: { ...VH_SLOTS, heroPhoto: [], portraitCluster: [] }, unavailableMediaIds: [PHOTO.P3] });
      expect(tiles(html)).toStrictEqual(["0:RESOLVED", "1:UNAVAILABLE", "2:RESOLVED", "3:RESOLVED"]);
      expect(count(html, COPY.gallery.unavailable)).toBe(1);
      expect(html).not.toContain(fixtureMediaUrl(PHOTO.P3));
    });

    it("an empty gallery slot hides the section through the effective sections contract", async () => {
      const { html, fixture } = await renderVh({ ...ALL_MEDIA, slots: { ...VH_SLOTS, gallery: [] } });
      expect(fixture.viewModel.sections.gallery).toBe(false);
      expect(fixture.selection.effectiveSections.gallery).toBe(false);
      expect(html).not.toContain('data-island="gallery"');
      expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.GALLERY_1));
    });

    it.each([1, 2, 3, 5, 7, 12])("%i photos lay out every slot item exactly once, in order", async (n) => {
      const ids = [PHOTO.P1, PHOTO.P2, PHOTO.P3, PHOTO.P4, PHOTO.P5, PHOTO.P6, FIXTURE_MEDIA_IDS.COVER, FIXTURE_MEDIA_IDS.GALLERY_1, FIXTURE_MEDIA_IDS.GALLERY_2, FIXTURE_MEDIA_IDS.GALLERY_3, FIXTURE_MEDIA_IDS.PORTRAIT_GROOM, FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE].slice(0, n);
      const { html } = await renderVh({ ...ALL_MEDIA, slots: { gallery: ids } });
      expect(imageIds(html.slice(html.indexOf('data-island="gallery"')))).toStrictEqual(ids);
    });
  });
});
