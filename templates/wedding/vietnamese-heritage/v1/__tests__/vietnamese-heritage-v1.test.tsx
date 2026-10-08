import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderToStaticMarkupAsync } from "../../../../core/__tests__/support/render-static-markup";
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
const { Rsvp } = await import("../interactive/rsvp");
const { Gift } = await import("../sections/gift");
const { CoupleName, COUPLE_NAME_SINGLE_LINE_MAX_CHARS, coupleNameLength } = await import("../sections/couple-name");
const { albumPrintRatio } = await import("../sections/gallery-layout");
const { OpeningCover } = await import("../sections/opening-cover");
const { MusicControl, musicStatusNote } = await import("../interactive/music-control");
const { Countdown, ceremonyCountdownParts } = await import("../interactive/countdown");
const { OPENING_TIMING_MS, activateOpening, openingReducer } = await import("../interactive/opening-state");
const { runMusicToggle, startMusicOnOpen } = await import("../../../../../lib/invitation-rendering/music-control-model");
const { GalleryLightbox, slotAlt, stepViewer, viewerSequence } = await import("../interactive/gallery-lightbox");
const { VH_REVEAL_TARGETS, VH_REVEAL_VARIANTS, albumPrintVariant, portraitVariant, SectionReveal } = await import("../interactive/section-reveal");
const { revealDelaysMs, startSectionReveal } = await import("../../../../../lib/invitation-rendering/section-reveal-controller");
const styles = (await import("../vietnamese-heritage-v1.module.css")).default as Record<string, string>;

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
    const vhHtml = await renderToStaticMarkupAsync(
      <InvitationRendererHost rendererKey={VH_KEY} viewModel={vh.viewModel} sections={vh.selection.effectiveSections} />,
    );
    expect(vhHtml).toContain('data-renderer="vietnamese-heritage-v1"');
    expect(vhHtml).not.toContain("elegant-editorial-v1");

    const ee = await runRendererFixturePipeline(buildRendererFixtureSourceInput({ variant: "BRIDE" }), {
      resolver: createFixtureMediaResolver(),
    });
    expect(ee.selection.rendererKey).toBe(EE_KEY);
    const eeHtml = await renderToStaticMarkupAsync(
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
    expect(html).not.toMatch(/<audio|<form/);
    // No capability → no RSVP or music. Controls: the opening button (VH-02B-M1); the gift CTA and, in
    // its closed dialog, the close control and the two COMMON side tabs (VH-02B-E1); one open control
    // per RESOLVED album print (4 here; VH-02B-M2). The closed album viewer renders no controls yet.
    expect(html.match(/<button/g)).toHaveLength(9);
    expect(html.match(/<dialog/g)).toHaveLength(2);
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
    // VH-02B-M1: the closed cover's only control is the explicit opening button; no form, dialog or tab stop.
    expect(html).toContain('data-opening="closed"');
    const opening = html.slice(html.indexOf('data-opening="closed"'), html.indexOf('id="vh-hero-names"'));
    const buttons = opening.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toMatch(/^<button type="button" class="[^"]*coverOpenButton[^"]*" aria-label="Chạm để mở thiệp">$/);
    expect(opening).not.toMatch(/<form|<dialog|onclick|tabindex/i);
    // Without capabilities: no RSVP form, no copy control.
    expect(html).not.toMatch(/<form|Xác Nhận Tham Dự|Sao chép/);
  });

  it("Song Hỷ: deterministic vector marks with an accessible name, never a font glyph; medallion raster only on opening/hero", async () => {
    const { html } = await renderVh(ALL_MEDIA);
    expect(html).not.toContain("囍");
    expect(html).not.toMatch(/<text\b/);
    const marks = [...html.matchAll(/role="img" aria-label="Song Hỷ"><svg[^>]*aria-hidden="true"/g)];
    expect(marks).toHaveLength(2);
    // The medallion artwork: opening cover + hero seal, each named.
    const medallions = [...html.matchAll(/<img [^>]*>/g)].map((match) => match[0]).filter((tag) => tag.includes("medallion-double-happiness.webp"));
    // Left door, right door (VH-02B-M1: the face is drawn on both doors) and hero seal.
    expect(medallions).toHaveLength(3);
    for (const tag of medallions) expect(tag).toContain('alt="Song Hỷ"');
    // The right door's copy is hidden from assistive technology.
    const rightDoor = html.slice(html.indexOf('data-door="right"'), html.indexOf("</header>"));
    expect(html).toMatch(/data-door="right" aria-hidden="true"/);
    expect(rightDoor.match(/medallion-double-happiness/g)).toHaveLength(1);
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
    const tiles = (html: string) =>
      [...html.matchAll(/class="[^"]*albumPrint[^"]*"[^>]*?data-status="(\w+)" data-index="(\d+)"/g)].map((match) => `${match[2]}:${match[1]}`);

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

// ---------------------------------------------------------------------------
// H. VH-02A-QA1 (names, safe gallery, directions) and VH-02B-E1 (RSVP, gift)
// ---------------------------------------------------------------------------

const VH_DIR = join(__dirname, "..");
const cssSource = readFileSync(join(VH_DIR, "vietnamese-heritage-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function cssRule(selector: string): string {
  const start = cssSource.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  return cssSource.slice(start, cssSource.indexOf("}", start));
}

function rsvpDouble(): InvitationRendererCapabilitiesV1["rsvp"] & { submit: ReturnType<typeof vi.fn> } {
  return { submit: vi.fn(async () => ({ status: "SUCCESS" as const })) };
}

function clipboardDouble(): NonNullable<InvitationRendererCapabilitiesV1["clipboard"]> & { copyText: ReturnType<typeof vi.fn> } {
  return { copyText: vi.fn(async () => ({ status: "SUCCESS" as const })) };
}

function renderWith(fixture: RendererFixture, capabilities: InvitationRendererCapabilitiesV1): string {
  return renderToStaticMarkup(
    <VietnameseHeritageV1 viewModel={fixture.viewModel} sections={fixture.selection.effectiveSections} capabilities={capabilities} />,
  );
}

function findElements(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child as ReactNode, type));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const own = node.type === type ? [node] : [];
  return [...own, ...findElements(node.props.children as ReactNode, type)];
}

async function namedFixture(groomName: string, brideName: string, variant: InvitationVariant = "GROOM"): Promise<RendererFixture> {
  const input = vhSource({ variant });
  const details = input.weddingDetails as NonNullable<BuildSnapshotPayloadInput["weddingDetails"]>;
  input.weddingDetails = { ...details, groomName, brideName };
  return runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver() });
}

describe("H. long couple names (VH-02A-QA1)", () => {
  const NAMES = ["Nguyễn Văn Nam", "Nguyễn Thị Hà", "Nguyễn Hoàng Minh Anh", "Trần Nguyễn Phương Thảo"] as const;

  it.each([
    ["Nguyễn Văn Nam", 14],
    ["Nguyễn Thị Hà", 13],
    ["Nguyễn Hoàng Minh Anh", 21],
    ["Trần Nguyễn Phương Thảo", 23],
    ["Tôn Nữ Hoàng Bảo Ngọc Quyên Anh", 31],
  ] as const)("%s counts %i code points", (name, chars) => {
    expect(coupleNameLength(name)).toBe(chars);
  });

  it("each name is its own verbatim block on the cover and the hero, one-line up to the limit", async () => {
    for (const [groom, bride] of [
      [NAMES[0], NAMES[1]],
      [NAMES[2], NAMES[3]],
    ] as const) {
      const fixture = await namedFixture(groom, bride);
      const html = render(fixture.viewModel, fixture.selection.effectiveSections);
      for (const name of [groom, bride]) {
        const blocks = [...html.matchAll(/<span class="[^"]*coupleName[^"]*" style="--vh-name-chars:(\d+)" data-name-fit="(\w+)">([^<]*)<\/span>/g)].filter(
          (match) => match[3] === name,
        );
        // Left door, right door (aria-hidden visual copy) and hero: the full name unsplit in one span each.
        expect(blocks, name).toHaveLength(3);
        for (const block of blocks) {
          expect(block[1]).toBe(String(coupleNameLength(name)));
          expect(block[2]).toBe("line");
        }
      }
    }
  });

  it("only a name over the single-line limit takes the balanced-wrap fallback", () => {
    expect(COUPLE_NAME_SINGLE_LINE_MAX_CHARS).toBe(24);
    const long = renderToStaticMarkup(<CoupleName name="Tôn Nữ Hoàng Bảo Ngọc Quyên Anh" />);
    expect(long).toContain('data-name-fit="wrap"');
    expect(long).toContain(">Tôn Nữ Hoàng Bảo Ngọc Quyên Anh<");
    expect(renderToStaticMarkup(<CoupleName name={"A".repeat(24)} />)).toContain('data-name-fit="line"');
  });

  it("CSS: nowrap one-line blocks sized from the code-point count, clamped; no fixed width; balanced fallback", () => {
    const base = cssRule(".coupleName");
    expect(base).toMatch(/white-space: nowrap/);
    expect(base).toMatch(/max-width: 100%/);
    expect(base).not.toMatch(/(^|\s)width:/);
    expect(cssRule('.coupleName[data-name-fit="wrap"]')).toMatch(/white-space: normal;[\s\S]*text-wrap: balance/);
    expect(cssRule(".coverNames .coupleName")).toMatch(
      /font-size: clamp\(17px, calc\(\(100cqw - 2 \* var\(--border-reach\) - 12px\) \/ \(var\(--vh-name-chars\) \* 0\.56\)\), 41px\)/,
    );
    expect(cssRule(".heroNames .coupleName")).toMatch(/font-size: clamp\(17px, calc\(\(100cqw - 60px\) \/ \(var\(--vh-name-chars\) \* 0\.56\)\), 38px\)/);
    // No measurement loop or token splitting in the name module.
    const nameModule = readFileSync(join(VH_DIR, "sections", "couple-name.tsx"), "utf8");
    expect(nameModule).not.toMatch(/\.split\(|getBoundingClientRect|offsetWidth|scrollWidth|useEffect|ResizeObserver/);
  });
});

describe("H. safe gallery prints (VH-02A-QA1)", () => {
  const ratios = (html: string) =>
    [...html.matchAll(/<div class="[^"]*albumPrint[^"]*"( style="--vh-print-ratio:([\d.]+)")? data-status="(\w+)" data-index="(\d+)" data-fit="contain"/g)].map(
      (match) => `${match[4]}:${match[2] ?? "row"}`,
    );

  it("albumPrintRatio: full-width rows take the photo ratio bounded 4:5–3:2; pairs, unknown sizes and UNAVAILABLE keep the row shape", () => {
    const resolved = (width: number | null, height: number | null) => ({ status: "RESOLVED" as const, mediaId: "m", url: "u", width, height });
    expect(albumPrintRatio("wide", resolved(800, 1200))).toBe(0.8);
    expect(albumPrintRatio("large", resolved(1200, 800))).toBe(1.5);
    expect(albumPrintRatio("large", resolved(1200, 1200))).toBe(1);
    expect(albumPrintRatio("wide", resolved(4000, 1000))).toBe(1.5);
    expect(albumPrintRatio("wide", resolved(1000, 1100))).toBe(0.9091);
    expect(albumPrintRatio("pair", resolved(800, 1200))).toBeNull();
    expect(albumPrintRatio("tall", resolved(800, 1200))).toBeNull();
    expect(albumPrintRatio("wide", resolved(null, null))).toBeNull();
    expect(albumPrintRatio("wide", { status: "UNAVAILABLE", mediaId: "m" })).toBeNull();
  });

  it.each([
    ["portrait", FIXTURE_MEDIA_IDS.GALLERY_2, "0.8"],
    ["landscape", FIXTURE_MEDIA_IDS.GALLERY_1, "1.5"],
    ["square", FIXTURE_MEDIA_IDS.GALLERY_3, "1"],
  ] as const)("a single %s photo gets its own bounded print ratio", async (_label, id, ratio) => {
    const { html } = await renderVh({ ...ALL_MEDIA, slots: { gallery: [id] } });
    expect(ratios(html)).toStrictEqual([`0:${ratio}`]);
  });

  it("mixed gallery: slot order kept, full-width rows ratio-aware, paired rows keep their shape, UNAVAILABLE stays", async () => {
    const ids = [FIXTURE_MEDIA_IDS.GALLERY_2, FIXTURE_MEDIA_IDS.GALLERY_1, FIXTURE_MEDIA_IDS.GALLERY_3, FIXTURE_MEDIA_IDS.COVER, PHOTO.P1];
    const { html } = await renderVh({ ...ALL_MEDIA, slots: { gallery: ids }, unavailableMediaIds: [FIXTURE_MEDIA_IDS.GALLERY_3] });
    // large(0) · pair(1, 2) · tall(3, 4)
    expect(ratios(html)).toStrictEqual(["0:0.8", "1:row", "2:row", "3:row", "4:row"]);
    expect([...html.matchAll(/data-status="(\w+)" data-index="\d+" data-fit/g)].map((match) => match[1])).toStrictEqual([
      "RESOLVED",
      "RESOLVED",
      "UNAVAILABLE",
      "RESOLVED",
      "RESOLVED",
    ]);
  });

  it("CSS: album photos are contained on the print mat, never cover-cropped (the lightbox too)", () => {
    expect(cssRule(".albumPhoto,\n.albumUnavailable")).toMatch(/object-fit: contain/);
    const albumRules = [...cssSource.matchAll(/(\.(album|viewer)[^{]*)\{([^}]*)\}/g)];
    expect(albumRules.length).toBeGreaterThan(10);
    for (const [, selector, , body] of albumRules) expect(body, selector).not.toMatch(/object-fit: cover|object-position/);
    expect(cssRule(".viewerImage")).toMatch(/object-fit: contain/);
  });
});

describe("H. directions CTA (VH-02A-QA1)", () => {
  const links = (html: string) =>
    [...html.matchAll(/<a class="[^"]*venueMapLink[^"]*" href="([^"]+)" target="_blank" rel="noopener noreferrer">([^<]+)</g)].map((match) => [
      match[1],
      match[2],
    ]);

  it("COMMON: each ceremony card links its own canonical mapUrl with the visible CTA", async () => {
    const { html } = await renderVh({ variant: "COMMON" });
    expect(links(html)).toStrictEqual([
      ["https://maps.example.invalid/groom-home", "Xem chỉ đường"],
      ["https://maps.example.invalid/bride-home", "Xem chỉ đường"],
    ]);
    const cta = cssRule(".venueMapLink");
    expect(cta).toMatch(/min-height: 44px/);
    expect(cta).toMatch(/background: var\(--vh-vermilion\)/);
  });

  it("GROOM / BRIDE use only their own ceremony card URL", async () => {
    expect(links((await renderVh({ variant: "GROOM" })).html)).toStrictEqual([["https://maps.example.invalid/groom-home", "Xem chỉ đường"]]);
    expect(links((await renderVh({ variant: "BRIDE" })).html)).toStrictEqual([["https://maps.example.invalid/bride-home", "Xem chỉ đường"]]);
  });

  it("a null mapUrl renders no actionable link and nothing is fabricated from the venue or address", async () => {
    const input = vhSource({ variant: "COMMON" });
    input.events = input.events.map((event) => (event.mapUrl === "https://maps.example.invalid/groom-home" ? { ...event, mapUrl: null } : event));
    const fixture = await runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver() });
    const html = render(fixture.viewModel, fixture.selection.effectiveSections);
    expect(links(html)).toStrictEqual([["https://maps.example.invalid/bride-home", "Xem chỉ đường"]]);
    expect(html).not.toMatch(/google\.[a-z]+\/maps|maps\.google|maps\.apple|geo:/);
    expect(count(html, "Xem chỉ đường")).toBe(1);
    // The canonical event is untouched.
    expect(fixture.viewModel.ceremonyCards.find((card) => card.side === "GROOM")?.event.mapUrl).toBeNull();
  });
});

describe("H. RSVP island (VH-02B-E1)", () => {
  it("no capabilities.rsvp → no RSVP section", async () => {
    const fixture = await vhFixture(ALL_MEDIA);
    const html = renderWith(fixture, { clipboard: clipboardDouble() });
    expect(html).not.toContain("vh-rsvp-heading");
    expect(html).not.toContain(COPY.rsvp.heading);
  });

  it("with the capability: placed after Love Story and before Gift, the root hands over exactly that capability", async () => {
    const fixture = await vhFixture(ALL_MEDIA);
    const rsvp = rsvpDouble();
    const html = renderWith(fixture, { rsvp });
    const at = (needle: string) => html.indexOf(needle);
    expect(at("vh-love-story-heading")).toBeLessThan(at("vh-rsvp-heading"));
    expect(at("vh-rsvp-heading")).toBeLessThan(at("vh-gift-heading"));
    expect(at("vh-gift-heading")).toBeLessThan(at("vh-dress-code-heading"));
    const tree = VietnameseHeritageV1({ viewModel: fixture.viewModel, sections: fixture.selection.effectiveSections, capabilities: { rsvp } });
    const [element] = findElements(tree, Rsvp);
    expect(element?.props.rsvp).toBe(rsvp);
    expect(rsvp.submit).not.toHaveBeenCalled();
  });

  it("Task 029 form: title, empty name, three attendance choices starting on ATTENDING, party size 1–20, wish, submit", async () => {
    const html = renderToStaticMarkup(<Rsvp rsvp={rsvpDouble()} />);
    expect(html).toContain(">Xác Nhận Tham Dự</span> <span>&amp; Gửi Lời Chúc</span>");
    const nameInput = html.match(/<input id="vh-rsvp-guest-name"[^>]*>/)?.[0] ?? "";
    for (const attribute of ['placeholder="Tên của bạn"', 'maxLength="200"', 'required=""', 'name="guestName"', 'value=""', 'autoComplete="name"']) {
      expect(nameInput, attribute).toContain(attribute);
    }
    const options = [...html.matchAll(/<option value="(\w+)"( selected="")?>([^<]+)<\/option>/g)].map((match) => [match[1], match[3], Boolean(match[2])]);
    expect(options.slice(0, 3)).toStrictEqual([
      ["ATTENDING", "Sẽ tham dự", true],
      ["MAYBE", "Sẽ cố gắng tham dự", false],
      ["NOT_ATTENDING", "Tiếc quá, không tham dự được", false],
    ]);
    const sizes = [...html.matchAll(/<option value="(\d+)"/g)].map((match) => Number(match[1]));
    expect(sizes).toStrictEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(html).toContain(">Số người tham dự</label>");
    expect(html).toContain('placeholder="Gửi lời chúc đến cô dâu &amp; chú rể..."');
    expect(html).toMatch(/<button type="submit" class="[^"]*">Gửi ngay<\/button>/);
    expect(html).toContain('data-rsvp-phase="idle"');
    // No success before the capability resolved SUCCESS.
    expect(html).not.toContain(COPY.rsvp.successThanks);
  });
});

describe("H. wedding gift CTA and dialog (VH-02B-E1)", () => {
  type GiftProps = Parameters<typeof Gift>[0];
  const QR_RESOLVED = { status: "RESOLVED" as const, mediaId: FIXTURE_MEDIA_IDS.QR_GROOM, url: fixtureMediaUrl(FIXTURE_MEDIA_IDS.QR_GROOM), width: 600, height: 600 };
  const QR_BRIDE = { status: "RESOLVED" as const, mediaId: FIXTURE_MEDIA_IDS.QR_BRIDE, url: fixtureMediaUrl(FIXTURE_MEDIA_IDS.QR_BRIDE), width: 600, height: 600 };
  const GROOM_LINES = {
    side: "GROOM" as const,
    bankName: "Ngân hàng Hoa Sữa",
    bankAccountName: "NGUYEN MINH KHOI",
    bankAccountNumber: "9001000000001",
    bankQrMediaId: null,
  };
  const BRIDE_LINES = {
    side: "BRIDE" as const,
    bankName: "Ngân hàng Phượng Vĩ",
    bankAccountName: "TRAN NGOC HAN",
    bankAccountNumber: "9001000000002",
    bankQrMediaId: null,
  };
  const giftHtml = (props: Partial<GiftProps>) =>
    renderToStaticMarkup(<Gift operationalSides={["GROOM"]} gift={{}} qr={{}} clipboard={undefined} {...props} />);

  it("no honest gift content → nothing: no empty CTA, no empty dialog", () => {
    expect(giftHtml({})).toBe("");
    expect(giftHtml({ gift: { groom: { ...GROOM_LINES, bankName: " ", bankAccountName: null, bankAccountNumber: null } } })).toBe("");
    expect(giftHtml({ qr: { groom: { status: "UNAVAILABLE", mediaId: FIXTURE_MEDIA_IDS.QR_GROOM } } })).toBe("");
  });

  it("the page shows only the note and the visible “Gửi Quà Cưới” CTA; details live in the closed dialog", () => {
    const html = giftHtml({ gift: { groom: GROOM_LINES }, qr: { groom: QR_RESOLVED } });
    const page = html.slice(0, html.indexOf("<dialog"));
    expect(page).toContain(COPY.gift.intro);
    expect(page).toMatch(/<button type="button" class="[^"]*giftOpen[^"]*" aria-haspopup="dialog">Gửi Quà Cưới<\/button>/);
    expect(page).not.toContain("9001000000001");
    const dialog = html.slice(html.indexOf("<dialog"));
    expect(dialog).not.toMatch(/<dialog[^>]* open/);
    expect(dialog).toContain('aria-labelledby="vh-gift-dialog-title"');
    expect(dialog).toContain('aria-label="Đóng"');
    expect(dialog).toContain(">Gửi Quà Cưới</h2>");
  });

  it("one side: one panel with its label, no side controls", () => {
    const html = giftHtml({ gift: { groom: GROOM_LINES } });
    expect(html).not.toMatch(/giftTab/);
    expect(html).toMatch(/class="[^"]*giftSideLabel[^"]*">Nhà Trai</);
    expect(html.match(/data-side="(\w+)"/g)).toStrictEqual(['data-side="GROOM"']);
  });

  it("two sides: explicit Nhà Trai / Nhà Gái controls in operationalSides order, first selected", () => {
    const html = giftHtml({ operationalSides: ["GROOM", "BRIDE"], gift: { groom: GROOM_LINES, bride: BRIDE_LINES } });
    const tabs = [...html.matchAll(/class="[^"]*giftTab[^"]*" aria-pressed="(\w+)" aria-controls="vh-gift-panel-(\w+)">([^<]+)</g)].map((match) => match.slice(1));
    expect(tabs).toStrictEqual([
      ["true", "GROOM", "Nhà Trai"],
      ["false", "BRIDE", "Nhà Gái"],
    ]);
    expect(html).toMatch(/id="vh-gift-panel-BRIDE" class="[^"]*" data-side="BRIDE" hidden=""/);
    expect(html).not.toMatch(/giftSideLabel/);
  });

  it("QR: RESOLVED renders in its plate; UNAVAILABLE is absent and never replaced; bank text stays", () => {
    const resolved = giftHtml({ operationalSides: ["GROOM", "BRIDE"], gift: { groom: GROOM_LINES, bride: BRIDE_LINES }, qr: { groom: QR_RESOLVED, bride: QR_BRIDE } });
    expect(resolved).toContain(src(FIXTURE_MEDIA_IDS.QR_GROOM));
    expect(resolved).toContain(src(FIXTURE_MEDIA_IDS.QR_BRIDE));
    const html = giftHtml({ gift: { groom: GROOM_LINES }, qr: { groom: { status: "UNAVAILABLE", mediaId: FIXTURE_MEDIA_IDS.QR_GROOM } } });
    expect(html).not.toMatch(/<img/);
    expect(html).toContain("9001000000001");
    expect(html).toContain("Ngân hàng Hoa Sữa");
  });

  it("clipboard absent → no copy control (number still shown); present → one control per account number", () => {
    const without = giftHtml({ operationalSides: ["GROOM", "BRIDE"], gift: { groom: GROOM_LINES, bride: BRIDE_LINES } });
    expect(without).not.toMatch(/giftCopy|Sao chép/);
    expect(without).toContain("9001000000002");
    const clipboard = clipboardDouble();
    const withCopy = giftHtml({ operationalSides: ["GROOM", "BRIDE"], gift: { groom: GROOM_LINES, bride: BRIDE_LINES }, clipboard });
    expect(withCopy.match(/<button type="button" class="[^"]*giftCopy[^"]*" data-copy-feedback="idle">Sao chép/g)).toHaveLength(2);
    expect(withCopy).toContain("số tài khoản Nhà Gái");
    expect(clipboard.copyText).not.toHaveBeenCalled();
    // No account number → no copy control.
    expect(giftHtml({ gift: { groom: { ...GROOM_LINES, bankAccountNumber: null } }, clipboard })).not.toMatch(/giftCopy/);
  });

  it("the root passes clipboard only through the gift section and keeps sections.gift as the visibility gate", async () => {
    const fixture = await vhFixture(ALL_MEDIA);
    const clipboard = clipboardDouble();
    const tree = VietnameseHeritageV1({ viewModel: fixture.viewModel, sections: fixture.selection.effectiveSections, capabilities: { clipboard } });
    const [gift] = findElements(tree, Gift);
    expect(gift?.props.clipboard).toBe(clipboard);
    const hidden = await vhFixture({ ...ALL_MEDIA, sectionSettings: { gift: false } });
    const hiddenTree = VietnameseHeritageV1({ viewModel: hidden.viewModel, sections: hidden.selection.effectiveSections, capabilities: { clipboard } });
    expect(findElements(hiddenTree, Gift)).toHaveLength(0);
  });

  it("dialog contract: native modal, every close path returns focus to the CTA, backdrop closes", () => {
    const code = readFileSync(join(VH_DIR, "interactive", "gift-dialog.tsx"), "utf8");
    expect(code).toMatch(/if \(open && !dialog\.open\) dialog\.showModal\(\);/);
    expect(code).toMatch(/function finishClose\(\) \{[\s\S]*?setActiveSide\(null\);[\s\S]*?setGeneration[\s\S]*?openerRef\.current\?\.focus\(\);/);
    // ✕ and backdrop finish immediately; Escape finishes through the native close event, ignored once reopened.
    expect(code).toMatch(/function requestClose\(\) \{[\s\S]*?dialog\.close\(\);\s*finishClose\(\);/);
    expect(code).toMatch(/onClick=\{requestClose\}/);
    expect(code).toMatch(/if \(event\.target === event\.currentTarget\) requestClose\(\);/);
    expect(code).toMatch(/onClose=\{handleNativeClose\}/);
    expect(code).toMatch(/function handleNativeClose\(\) \{\s*if \(dialogRef\.current\?\.open === true\) return;\s*if \(open\) finishClose\(\);/);
    expect(code).not.toMatch(/router|history\.|location\.|localStorage|sessionStorage/);
  });
});

// ---------------------------------------------------------------------------
// I. VH-02B-M1 — split-door opening, music, countdown
// ---------------------------------------------------------------------------

type MusicStatus = "PAUSED" | "PLAYING" | "BLOCKED" | "ERROR";

function musicDouble(status: MusicStatus, reject = false) {
  return {
    status,
    play: vi.fn(async () => {
      if (reject) throw new Error("fault");
    }),
    pause: vi.fn(async () => undefined),
  };
}

const keyframes = (name: string): string => {
  const start = cssSource.indexOf(`@keyframes ${name} {`);
  expect(start, name).toBeGreaterThan(-1);
  // A top-level @keyframes block ends at the first closing brace in column 0.
  return cssSource.slice(start, cssSource.indexOf("\n}", start) + 2);
};

describe("I. split-door opening (VH-02B-M1)", () => {
  it("state machine: CLOSED → OPENING only by OPEN, → DONE only by FINISHED; DONE is final", () => {
    expect(openingReducer("CLOSED", "FINISHED")).toBe("CLOSED");
    expect(openingReducer("CLOSED", "OPEN")).toBe("OPENING");
    expect(openingReducer("OPENING", "OPEN")).toBe("OPENING");
    expect(openingReducer("OPENING", "FINISHED")).toBe("DONE");
    expect(openingReducer("DONE", "OPEN")).toBe("DONE");
    expect(openingReducer("DONE", "FINISHED")).toBe("DONE");
  });

  it("activation runs onOpen once inside the click and never again once opening", () => {
    const onOpen = vi.fn();
    const dispatch = vi.fn();
    activateOpening("CLOSED", onOpen, dispatch);
    activateOpening("OPENING", onOpen, dispatch);
    activateOpening("DONE", onOpen, dispatch);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls).toStrictEqual([["OPEN"]]);
    activateOpening("CLOSED", undefined, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("renders CLOSED with one real button named by the hint, the right door and hint hidden from assistive tech", async () => {
    const { html } = await renderVh({ variant: "GROOM" });
    const cover = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(cover).toMatch(/^<header class="[^"]*opening[^"]*" data-opening="closed" data-island="opening">/);
    // Server markup is never "interactive": the scroll hold only starts after hydration.
    expect(cover).not.toContain("data-interactive");
    expect(cover.match(/<button type="button"[^>]*aria-label="Chạm để mở thiệp"/g)).toHaveLength(1);
    expect(cover).toMatch(/data-door="left">/);
    expect(cover).toMatch(/data-door="right" aria-hidden="true">/);
    expect(cover.match(/<p class="[^"]*coverHint[^"]*" aria-hidden="true">Chạm để mở thiệp<\/p>/g)).toHaveLength(2);
    // Accessible cover text appears once: only in the left door.
    const left = cover.slice(cover.indexOf('data-door="left"'), cover.indexOf('data-door="right"'));
    expect(left).toContain("Thiệp Mời Cưới");
    expect(left).toContain("Nguyễn Minh Khôi");
  });

  it("the island: explicit button only, no timer, cover leaves the tree at DONE, focus to the Hero without scrolling", () => {
    const code = readFileSync(join(VH_DIR, "interactive", "opening-interaction.tsx"), "utf8");
    // A synchronous guard: presses that land before the OPENING rerender cannot run onOpen again.
    expect(code).toMatch(/onClick=\{\(\) => \{\s*if \(activated\.current\) return;\s*activated\.current = true;\s*activateOpening\(phase, onOpen, dispatch\);/);
    expect(code).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|Date\.now|localStorage|sessionStorage|cookie|router|history\./);
    expect(code).toMatch(/if \(phase === "DONE"\) return null;/);
    expect(code).toMatch(/if \(event\.target !== event\.currentTarget \|\| phase !== "OPENING"\) return;/);
    expect(code).toMatch(/heading\.focus\(\{ preventScroll: true \}\);/);
  });

  it("CSS: Task 029 timing — text/medallion first, doors from 260 ms for 880 ms in opposite directions, 1180 ms total", () => {
    expect(OPENING_TIMING_MS).toStrictEqual({ doorsStart: 260, doorsDuration: 880, total: 1180, reducedTotal: 220 });
    expect(cssRule('.opening[data-opening="opening"]')).toMatch(/animation: vh-opening-finish 1180ms linear both/);
    expect(cssRule('.opening[data-opening="opening"] .door[data-door="left"]')).toMatch(/vh-door-left 880ms cubic-bezier\(0\.65, 0, 0\.35, 1\) 260ms both/);
    expect(cssRule('.opening[data-opening="opening"] .door[data-door="right"]')).toMatch(/vh-door-right 880ms cubic-bezier\(0\.65, 0, 0\.35, 1\) 260ms both/);
    expect(keyframes("vh-door-left")).toMatch(/translateX\(-100%\)/);
    expect(keyframes("vh-door-right")).toMatch(/translateX\(100%\)/);
    expect(cssRule('.opening[data-opening="opening"] .coverText')).toMatch(/vh-cover-text-out 300ms/);
    expect(cssRule('.opening[data-opening="opening"] .coverMedallionWrap')).toMatch(/vh-medallion-pulse 450ms/);
    expect(cssRule(".column:has(> .opening[data-opening=\"opening\"]) > :not(.opening)")).toMatch(/vh-inner-settle 700ms ease-out 260ms both/);
    // While opening the cover no longer takes pointer input; the scroll hold applies only while closed + interactive.
    expect(cssRule('.opening[data-opening="opening"]')).toMatch(/pointer-events: none/);
    expect(cssSource).toContain('.column:has(> .opening[data-opening="closed"][data-interactive="true"]) {');
  });

  it("long names survive the motion: keyframes move and fade only, never resize or rewrap text", () => {
    for (const name of ["vh-opening-finish", "vh-cover-text-out", "vh-fade-out", "vh-fade-in", "vh-medallion-pulse", "vh-door-left", "vh-door-right", "vh-inner-settle", "vh-opening-fade"]) {
      expect(keyframes(name), name).not.toMatch(/width|font-size|letter-spacing|white-space|max-width/);
    }
    // The couple-name sizing rules are unchanged by the opening.
    expect(cssRule(".coverNames .coupleName")).toMatch(/0\.56\)\), 41px\)/);
  });

  it("reduced motion: still an explicit tap; no door travel, the cover fades in 220 ms", () => {
    const reduce = cssSource.slice(cssSource.indexOf("@media (prefers-reduced-motion: reduce) {\n  .opening"));
    const block = reduce.slice(0, reduce.indexOf("\n}\n") + 3);
    expect(block).toMatch(/\.opening\[data-opening="opening"\] \{\s*animation: vh-opening-fade 220ms ease-out both;/);
    for (const selector of [".door[data-door=\"left\"]", ".door[data-door=\"right\"]", ".coverText", ".coverMedallionWrap", ".doorEdge", "> :not(.opening)"]) {
      expect(block, selector).toContain(selector);
    }
    expect(block).toMatch(/animation: none;/);
    expect(keyframes("vh-opening-fade")).toMatch(/opacity: 0/);
  });
});

describe("I. music (VH-02B-M1)", () => {
  it("control only with sections.music AND capabilities.music", async () => {
    const withMusic = await vhFixture(ALL_MEDIA);
    expect(withMusic.selection.effectiveSections.music).toBe(true);
    expect(renderWith(withMusic, { music: musicDouble("PAUSED") })).toMatch(/class="[^"]*musicButton[^"]*" aria-pressed="false"/);
    expect(renderWith(withMusic, {})).not.toMatch(/musicButton/);
    const sectionOff = await vhFixture({ ...ALL_MEDIA, sectionSettings: { music: false } });
    const music = musicDouble("PAUSED");
    const tree = VietnameseHeritageV1({ viewModel: sectionOff.viewModel, sections: sectionOff.selection.effectiveSections, capabilities: { music } });
    expect(findElements(tree, MusicControl)).toHaveLength(0);
    expect(findElements(tree, OpeningCover)[0]?.props.onOpen).toBeUndefined();
    expect(renderWith(sectionOff, { music })).not.toMatch(/musicButton/);
  });

  it("the opening makes exactly one play attempt, never when already PLAYING", async () => {
    const fixture = await vhFixture(ALL_MEDIA);
    const paused = musicDouble("PAUSED");
    const tree = VietnameseHeritageV1({ viewModel: fixture.viewModel, sections: fixture.selection.effectiveSections, capabilities: { music: paused } });
    const onOpen = findElements(tree, OpeningCover)[0]?.props.onOpen as () => void;
    const dispatch = vi.fn();
    activateOpening("CLOSED", onOpen, dispatch);
    activateOpening("OPENING", onOpen, dispatch);
    expect(paused.play).toHaveBeenCalledTimes(1);
    expect(paused.pause).not.toHaveBeenCalled();
    const playing = musicDouble("PLAYING");
    startMusicOnOpen(playing)();
    expect(playing.play).not.toHaveBeenCalled();
    expect(playing.pause).not.toHaveBeenCalled();
    // No music → the opening has no hook at all.
    const silent = VietnameseHeritageV1({ viewModel: fixture.viewModel, sections: fixture.selection.effectiveSections, capabilities: {} });
    expect(findElements(silent, OpeningCover)[0]?.props.onOpen).toBeUndefined();
  });

  it("toggle: status is the only truth; BLOCKED / ERROR retry with play; rejection absorbed", async () => {
    for (const status of ["PAUSED", "BLOCKED", "ERROR"] as const) {
      const music = musicDouble(status);
      await expect(runMusicToggle(music)).resolves.toBe("COMPLETED");
      expect(music.play).toHaveBeenCalledTimes(1);
    }
    const playing = musicDouble("PLAYING");
    await runMusicToggle(playing);
    expect(playing.pause).toHaveBeenCalledTimes(1);
    expect(playing.play).not.toHaveBeenCalled();
    await expect(runMusicToggle(musicDouble("BLOCKED", true))).resolves.toBe("FAULTED");
    expect(() => startMusicOnOpen(musicDouble("PAUSED", true))()).not.toThrow();
  });

  it.each([
    ["PLAYING", "true", "♫", null],
    ["PAUSED", "false", "♪", null],
    ["BLOCKED", "false", "♪", "Trình duyệt chưa cho phát nhạc. Chạm nút nhạc để thử lại."],
    ["ERROR", "false", "♪", "Chưa phát được nhạc nền."],
  ] as const)("%s → pressed=%s, glyph %s, honest note", (status, pressed, glyph, note) => {
    const html = renderToStaticMarkup(<MusicControl music={musicDouble(status)} />);
    expect(html).toContain(`data-music-status="${status.toLowerCase()}"`);
    expect(html).toContain(`aria-pressed="${pressed}"`);
    expect(html).toContain(`aria-hidden="true">${glyph}</span>`);
    expect(html).toContain(">Nhạc nền</span>");
    expect(musicStatusNote(status, false)).toBe(note);
    expect(musicStatusNote(status, true)).toBe(COPY.music.commandFailed);
  });
});

describe("I. countdown (VH-02B-M1)", () => {
  // GROOM ceremony: 2026-10-18T02:00:00Z.
  const clockAt = (iso: string) => ({ nowEpochMs: Date.parse(iso) });

  it("no capabilities.clock → no countdown (no zero placeholder)", async () => {
    const { html } = await renderVh({ variant: "GROOM" });
    expect(html).not.toMatch(/countdown|role="timer"/i);
  });

  it("upcoming: the four Task 029 cells from ceremony.startsAt and clock.nowEpochMs, after the schedule", async () => {
    const fixture = await vhFixture({ variant: "GROOM" });
    const html = renderWith(fixture, { clock: clockAt("2026-10-16T00:58:57Z") });
    const cells = [...html.matchAll(/countdownValue[^"]*">(\d+)<\/span><span class="[^"]*countdownLabel[^"]*">([^<]+)</g)].map((match) => `${match[1]} ${match[2]}`);
    expect(cells).toStrictEqual(["2 Ngày", "1 Giờ", "1 Phút", "3 Giây"]);
    expect(html).toContain('role="timer"');
    expect(html.indexOf("Đón khách")).toBeLessThan(html.indexOf('data-countdown="upcoming"'));
    expect(html.indexOf('data-countdown="upcoming"')).toBeLessThan(html.indexOf("vh-love-story-heading"));
  });

  it("a refreshed clock rerenders new values; never negative", async () => {
    const fixture = await vhFixture({ variant: "GROOM" });
    const ceremony = fixture.viewModel.ceremony;
    expect(ceremonyCountdownParts(ceremony, clockAt("2026-10-18T01:59:59Z"))?.map((part) => part.value)).toStrictEqual(["0", "0", "0", "1"]);
    expect(ceremonyCountdownParts(ceremony, clockAt("2026-10-17T02:00:00Z"))?.map((part) => part.value)).toStrictEqual(["1", "0", "0", "0"]);
  });

  it("passed (or exactly now): hidden, as in the approved Task 029 direction — no negative values, no ended message", async () => {
    const fixture = await vhFixture({ variant: "GROOM" });
    for (const iso of ["2026-10-18T02:00:00Z", "2026-10-19T00:00:00Z"]) {
      expect(ceremonyCountdownParts(fixture.viewModel.ceremony, clockAt(iso))).toBeNull();
      expect(renderToStaticMarkup(<Countdown ceremony={fixture.viewModel.ceremony} clock={clockAt(iso)} />)).toBe("");
      expect(renderWith(fixture, { clock: clockAt(iso) })).not.toMatch(/role="timer"|-\d+<\/span>/);
    }
  });

  it("the root gates the countdown on capabilities.clock only and reads no ambient time", () => {
    const root = readFileSync(join(VH_DIR, "vietnamese-heritage-v1.tsx"), "utf8");
    expect(root).toMatch(/\{capabilities\.clock !== undefined \? <Countdown ceremony=\{ceremony\} clock=\{capabilities\.clock\} \/> : null\}/);
    for (const file of ["interactive/countdown.tsx", "vietnamese-heritage-v1.tsx", "interactive/music-control.tsx", "interactive/opening-interaction.tsx"]) {
      const code = readFileSync(join(VH_DIR, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code, file).not.toMatch(/Date\.now|new Date|setInterval|setTimeout|performance\.now|<audio|HTMLAudioElement|navigator/);
    }
  });
});

// ---------------------------------------------------------------------------
// J. VH-02B-M2 — album lightbox and progressive section reveal
// ---------------------------------------------------------------------------

describe("J. album lightbox (VH-02B-M2)", () => {
  const GALLERY_WITH_GAP = [PHOTO.P6, PHOTO.P3, PHOTO.P1, FIXTURE_MEDIA_IDS.GALLERY_2];

  async function album(unavailable: readonly string[] = [PHOTO.P3]) {
    const { html, fixture } = await renderVh({ ...ALL_MEDIA, slots: { gallery: GALLERY_WITH_GAP }, unavailableMediaIds: unavailable });
    return { html: html.slice(html.indexOf('data-island="gallery"'), html.indexOf("<footer")), fixture };
  }

  it("the UNAVAILABLE tile stays in place and is not interactive; RESOLVED prints get a real open button named by slot", async () => {
    const { html } = await album();
    const prints = [...html.matchAll(/<div class="[^"]*albumPrint[^"]*"[^>]*data-status="(\w+)" data-index="(\d+)"[^>]*>(<button[^>]*>|<span[^>]*>)/g)].map(
      (match) => [match[2], match[1], (match[3] as string).startsWith("<button")],
    );
    expect(prints).toStrictEqual([
      ["0", "RESOLVED", true],
      ["1", "UNAVAILABLE", false],
      ["2", "RESOLVED", true],
      ["3", "RESOLVED", true],
    ]);
    const buttons = [...html.matchAll(/<button type="button" class="[^"]*albumOpen[^"]*" aria-haspopup="dialog" aria-label="([^"]+)">/g)].map((m) => m[1]);
    expect(buttons).toStrictEqual(["Xem ảnh cưới 1", "Xem ảnh cưới 3", "Xem ảnh cưới 4"]);
    expect(html).toContain(COPY.gallery.unavailable);
    // Photo alt text is the slot position, inside the open control.
    expect(html).toMatch(/aria-label="Xem ảnh cưới 3"><img [^>]*alt="Ảnh cưới 3"/);
  });

  it("viewer sequence: RESOLVED only, original slot order; navigation wraps both ways", async () => {
    const { fixture } = await album();
    const gallery = fixture.viewModel.media.templateSlots?.gallery ?? [];
    const rows = [{ kind: "large" as const, className: "", items: gallery.map((media, index) => ({ index, media, ratio: null })) }];
    const sequence = viewerSequence(rows);
    expect(sequence.map((photo) => photo.index)).toStrictEqual([0, 2, 3]);
    expect(sequence.map((photo) => photo.media.mediaId)).toStrictEqual([PHOTO.P6, PHOTO.P1, FIXTURE_MEDIA_IDS.GALLERY_2]);
    expect(stepViewer(0, 1, 3)).toBe(1);
    expect(stepViewer(2, 1, 3)).toBe(0);
    expect(stepViewer(0, -1, 3)).toBe(2);
    expect(stepViewer(0, 1, 1)).toBe(0);
    expect(slotAlt(2)).toBe("Ảnh cưới 3");
  });

  it("the closed viewer is a native dialog with no image, caption or extra controls", async () => {
    const { html } = await album();
    const dialog = html.slice(html.indexOf("<dialog"), html.indexOf("</dialog>") + 9);
    expect(dialog).toMatch(/^<dialog class="[^"]*viewer[^"]*" aria-label="Album ảnh cưới"><\/dialog>$/);
  });

  it("source contract: open exact photo, ✕/backdrop immediate, Escape via native close, arrows, focus back to the opener", () => {
    const code = readFileSync(join(VH_DIR, "interactive", "gallery-lightbox.tsx"), "utf8");
    expect(code).toMatch(/onClick=\{\(event\) => openAt\(index, event\.currentTarget\)\}/);
    expect(code).toMatch(/const at = sequence\.findIndex\(\(photo\) => photo\.index === index\);/);
    expect(code).toMatch(/if \(open && !dialog\.open\) dialog\.showModal\(\);/);
    expect(code).toMatch(/function requestClose\(\) \{[\s\S]*?dialog\.close\(\);\s*finishClose\(\);/);
    expect(code).toMatch(/aria-label=\{COPY\.close\} onClick=\{requestClose\}/);
    expect(code).toMatch(/if \(event\.target === event\.currentTarget\) requestClose\(\);/);
    expect(code).toMatch(/function handleNativeClose\(\) \{\s*if \(dialogRef\.current\?\.open === true\) return;\s*if \(open\) finishClose\(\);/);
    expect(code).toMatch(/openerRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
    expect(code).toMatch(/event\.key === "ArrowRight"[\s\S]*?step\(1\)[\s\S]*?event\.key === "ArrowLeft"[\s\S]*?step\(-1\)/);
    // Previous / next exist only with more than one photo; the count is the viewer position.
    expect(code).toMatch(/const navigable = sequence\.length > 1;/);
    expect(code).toMatch(/\{navigable \? \(/);
    expect(code).toMatch(/\{String\(\(position \?\? 0\) \+ 1\)\} \/ \{String\(sequence\.length\)\}/);
    const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(executable).not.toMatch(/figcaption|download|share|fetch|mediaId\s*\+|\.split\(/);
  });

  it("the gallery section still lays out every slot position and is the only lightbox host", async () => {
    const { html } = await renderVh({ ...ALL_MEDIA, slots: { gallery: [] } });
    expect(html).not.toContain('class="' + styles.viewer);
    const tree = findElements(VietnameseHeritageV1({ viewModel: (await vhFixture(ALL_MEDIA)).viewModel, sections: (await vhFixture(ALL_MEDIA)).selection.effectiveSections, capabilities: {} }), GalleryLightbox);
    // The lightbox is rendered by the gallery section, not by the root.
    expect(tree).toHaveLength(0);
  });
});

// A minimal DOM double for the shared reveal controller.
class FakeElement {
  readonly children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  readonly attributes = new Map<string, string>();
  readonly styleProps = new Map<string, string>();
  readonly style = {
    setProperty: (name: string, value: string) => void this.styleProps.set(name, value),
    removeProperty: (name: string) => void this.styleProps.delete(name),
  };
  constructor(
    readonly classes: readonly string[],
    readonly order: { value: number },
    readonly position = order.value++,
  ) {}
  get previousElementSibling(): FakeElement | null {
    const siblings = this.parentElement?.children ?? [];
    return siblings[siblings.indexOf(this) - 1] ?? null;
  }
  append(...elements: FakeElement[]): this {
    for (const element of elements) {
      element.parentElement = this;
      this.children.push(element);
    }
    return this;
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  matches(selectors: string): boolean {
    return selectors.split(",").some((selector) => this.classes.includes(selector.trim().slice(1)));
  }
  querySelectorAll(selectors: string): FakeElement[] {
    return this.children.flatMap((child) => [...(child.matches(selectors) ? [child] : []), ...child.querySelectorAll(selectors)]);
  }
  compareDocumentPosition(other: FakeElement): number {
    return other.position > this.position ? 4 : 2;
  }
}

function fakeObserverEnvironment() {
  const instances: { callback: (entries: { target: FakeElement; isIntersecting: boolean; boundingClientRect: { bottom: number } }[]) => void; observed: Set<FakeElement>; unobserved: FakeElement[] }[] = [];
  class FakeObserver {
    readonly record;
    constructor(callback: (typeof instances)[number]["callback"]) {
      this.record = { callback, observed: new Set<FakeElement>(), unobserved: [] as FakeElement[] };
      instances.push(this.record);
    }
    observe(target: FakeElement) {
      this.record.observed.add(target);
    }
    unobserve(target: FakeElement) {
      this.record.observed.delete(target);
      this.record.unobserved.push(target);
    }
    disconnect() {
      this.record.observed.clear();
    }
  }
  return { environment: { IntersectionObserver: FakeObserver }, instances };
}

const REVEAL_OPTIONS = { attribute: "data-vh-reveal", delayProperty: "--vh-reveal-delay", staggerMs: 110, maxStaggerSteps: 5, rootMargin: "0px 0px -40px 0px" };
const cls = (name: string) => styles[name] ?? name;

function revealColumn() {
  const order = { value: 0 };
  const column = new FakeElement(["column"], order);
  const hero = new FakeElement([cls("hero")], order);
  const opening = new FakeElement([cls("opening")], order);
  const page = new FakeElement([cls("page")], order);
  const song = new FakeElement([cls("songHy")], order);
  const row = new FakeElement([cls("portraitRow")], order);
  row.setAttribute("data-count", "3");
  const frames = [0, 1, 2].map(() => new FakeElement([cls("portraitFrame")], order));
  row.append(...frames);
  const items = Array.from({ length: 8 }, () => new FakeElement([cls("scheduleItem")], order));
  page.append(song, row, ...items);
  column.append(opening, hero, page);
  return { column, hero, opening, song, frames, items, order, page };
}

describe("J. progressive section reveal (VH-02B-M2)", () => {
  it("server markup is never hidden: no reveal attribute, and the controller island is an inert hidden anchor", async () => {
    const { html } = await renderVh(ALL_MEDIA);
    expect(html).not.toContain("data-vh-reveal");
    expect(renderToStaticMarkup(<SectionReveal hasCountdown={false} />)).toBe('<span hidden=""></span>');
  });

  it("without IntersectionObserver nothing is marked, so everything stays visible", () => {
    const { column, song, items } = revealColumn();
    const controller = startSectionReveal(column, {}, VH_REVEAL_TARGETS, REVEAL_OPTIONS);
    controller.rescan();
    for (const element of [song, ...items]) expect(element.getAttribute("data-vh-reveal")).toBeNull();
  });

  it("one shared observer marks targets after start; Opening and Hero are never targets", () => {
    const { column, song, frames, items, hero, opening } = revealColumn();
    const { environment, instances } = fakeObserverEnvironment();
    startSectionReveal(column, environment, VH_REVEAL_TARGETS, REVEAL_OPTIONS);
    expect(instances).toHaveLength(1);
    expect(song.getAttribute("data-vh-reveal")).toBe("scale");
    expect(frames.map((frame) => frame.getAttribute("data-vh-reveal"))).toStrictEqual(["left", "image", "right"]);
    expect(items.every((item) => item.getAttribute("data-vh-reveal") === "rise")).toBe(true);
    expect(hero.getAttribute("data-vh-reveal")).toBeNull();
    expect(opening.getAttribute("data-vh-reveal")).toBeNull();
    expect(instances[0]?.observed.size).toBe(1 + 3 + 8);
    // No Hero, opening or cover class is in the target map.
    const targetSelectors = VH_REVEAL_TARGETS.map((target) => target.selector);
    for (const name of ["hero", "heroPhoto", "heroNames", "heroSeal", "heroDate", "opening", "door", "coverContent", "coverNames", "coupleName"]) {
      expect(targetSelectors, name).not.toContain(`.${cls(name)}`);
    }
  });

  it("reveals once with a per-batch stagger capped at 5 steps, then unobserves; no replay on re-entry", () => {
    const { column, items } = revealColumn();
    const { environment, instances } = fakeObserverEnvironment();
    startSectionReveal(column, environment, VH_REVEAL_TARGETS, REVEAL_OPTIONS);
    const record = instances[0]!;
    record.callback([...items].reverse().map((target) => ({ target, isIntersecting: true, boundingClientRect: { bottom: 100 } })));
    expect(items.map((item) => item.styleProps.get("--vh-reveal-delay"))).toStrictEqual(["0ms", "110ms", "220ms", "330ms", "440ms", "550ms", "550ms", "550ms"]);
    expect(items.every((item) => item.getAttribute("data-vh-reveal") === "rise shown")).toBe(true);
    for (const item of items) expect(record.observed.has(item)).toBe(false);
    // Scrolling back: a further entry is ignored (already shown, no longer observed).
    record.callback([{ target: items[0]!, isIntersecting: true, boundingClientRect: { bottom: 100 } }]);
    expect(items[0]?.getAttribute("data-vh-reveal")).toBe("rise shown");
    // A new batch restarts at 0.
    expect(revealDelaysMs(3, 110, 5)).toStrictEqual([0, 110, 220]);
  });

  it("a target already scrolled past is revealed too, never left hidden; stop() removes every mark", () => {
    const { column, song, items } = revealColumn();
    const { environment, instances } = fakeObserverEnvironment();
    const controller = startSectionReveal(column, environment, VH_REVEAL_TARGETS, REVEAL_OPTIONS);
    instances[0]!.callback([{ target: song, isIntersecting: false, boundingClientRect: { bottom: -5 } }]);
    expect(song.getAttribute("data-vh-reveal")).toBe("scale shown");
    controller.stop();
    for (const element of [song, ...items]) {
      expect(element.getAttribute("data-vh-reveal")).toBeNull();
      expect(element.styleProps.size).toBe(0);
    }
  });

  it("rescan marks a capability-mounted countdown once, never inside an already-handled target", () => {
    const { column, page, order } = revealColumn();
    const { environment, instances } = fakeObserverEnvironment();
    const controller = startSectionReveal(column, environment, VH_REVEAL_TARGETS, REVEAL_OPTIONS);
    const cells = Array.from({ length: 4 }, () => new FakeElement([cls("countdownCell")], order));
    page.append(new FakeElement([cls("countdown")], order).append(...cells));
    controller.rescan();
    controller.rescan();
    expect(cells.map((cell) => cell.getAttribute("data-vh-reveal"))).toStrictEqual(["scale", "scale", "scale", "scale"]);
    expect(instances).toHaveLength(1);
    const nested = new FakeElement([cls("rsvpField")], order);
    const panel = new FakeElement([cls("rsvpPanel")], order);
    panel.setAttribute("data-vh-reveal", "card");
    page.append(panel.append(nested));
    controller.rescan();
    expect(nested.getAttribute("data-vh-reveal")).toBeNull();
  });

  it("variant derivation: cluster 3 → left/image/right, 2 → left/right, 1 → image; album pairs by side, full rows image", () => {
    const order = { value: 0 };
    const build = (attribute: string, value: string, count: number) => {
      const parent = new FakeElement(["x"], order);
      parent.setAttribute(attribute, value);
      const children = Array.from({ length: count }, () => new FakeElement(["y"], order));
      parent.append(...children);
      return children;
    };
    expect(build("data-count", "3", 3).map(portraitVariant)).toStrictEqual(["left", "image", "right"]);
    expect(build("data-count", "2", 2).map(portraitVariant)).toStrictEqual(["left", "right"]);
    expect(build("data-count", "1", 1).map(portraitVariant)).toStrictEqual(["image"]);
    expect(build("data-row", "pair", 2).map(albumPrintVariant)).toStrictEqual(["left", "right"]);
    expect(build("data-row", "tall", 2).map(albumPrintVariant)).toStrictEqual(["left", "right"]);
    expect(build("data-row", "wide", 1).map(albumPrintVariant)).toStrictEqual(["image"]);
    expect(build("data-row", "large", 1).map(albumPrintVariant)).toStrictEqual(["image"]);
  });

  it("CSS: seven variants, safe properties only, settled state natural; reduced motion keeps every target visible and still", () => {
    expect([...VH_REVEAL_VARIANTS]).toStrictEqual(["rise", "fade", "card", "image", "left", "right", "scale"]);
    for (const variant of VH_REVEAL_VARIANTS) {
      expect(cssSource, variant).toContain(`.column [data-vh-reveal="${variant}"] {`);
      expect(cssSource, variant).not.toMatch(new RegExp(`\\[data-vh-reveal="${variant}"\\] \\{[^}]*(width|height|margin|font-size)`));
      const shown = cssRule(`.column [data-vh-reveal="${variant} shown"]`);
      expect(shown).toMatch(new RegExp(`animation: vh-reveal-${variant} \\d+ms [^;]* var\\(--vh-reveal-delay\\) backwards;`));
      const properties = [...keyframes(`vh-reveal-${variant}`).matchAll(/^\s*([a-z-]+):/gm)].map((match) => match[1]);
      for (const property of properties) expect(["opacity", "translate", "scale", "clip-path"], `${variant}: ${String(property)}`).toContain(property);
    }
    // Every pending state and entrance exists only without a reduced-motion preference: under reduce no
    // reveal rule applies, so each target keeps its natural style (designed translucencies included).
    const noPreference = [...cssSource.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g)].map((m) => m[0]);
    expect(noPreference).toHaveLength(2);
    const outside = noPreference.reduce((css, block) => css.replace(block, ""), cssSource);
    expect(outside).not.toContain("[data-vh-reveal");
    expect(outside).not.toMatch(/animation: vh-viewer-in/);
    expect(noPreference.join("\n")).toMatch(/\.viewerImage \{\s*animation: vh-viewer-in 240ms ease-out both;/);
    // The opening's own reduced-motion rule is unchanged.
    expect(cssSource).toMatch(/\.opening\[data-opening="opening"\] \{\s*animation: vh-opening-fade 220ms ease-out both;/);
    // Safe-fit album prints are unchanged.
    expect(cssRule(".albumPhoto,\n.albumUnavailable")).toMatch(/object-fit: contain/);
  });

  it("the root mounts one reveal island, last in the column, with the countdown signal", () => {
    const root = readFileSync(join(VH_DIR, "vietnamese-heritage-v1.tsx"), "utf8");
    expect(root.match(/<SectionReveal\b/g)).toHaveLength(1);
    expect(root).toMatch(/<Closing [^>]*\/>\s*<SectionReveal hasCountdown=\{capabilities\.clock !== undefined\} \/>\s*<\/main>/);
  });
});
