import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS, type InvitationVariant } from "../../../../../lib/domain";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { InvitationRendererCapabilitiesV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { RendererSelectionError, RendererSelectionInvariantError } from "../../../../../lib/invitation-rendering/renderer-selection-errors";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import type { BuildSnapshotPayloadInput } from "../../../../../lib/invitation-rendering/snapshot-payload-types";
import { createFixtureMediaResolver, fixtureMediaUrl } from "../../../../core/fixtures/fixture-media-resolver";
import { runRendererFixturePipeline, type RendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import {
  FIXTURE_GUESTS,
  FIXTURE_MEDIA_IDS,
  FIXTURE_PHOTO_STORY_IDS,
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
 * VH-01 — Vietnamese Heritage v1 identity, compatibility, registry
 * coexistence and canonical mapping (docs/DECISIONS.md "VH-01 …"). Every
 * ViewModel comes from the real RF-02 → RF-03 → RF-04 fixture pipeline; the
 * fixture is the shared deterministic canonical one, re-bound to the VH
 * identity exactly as a staff design assignment would bind it.
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

/** The shared canonical fixture input, bound to the Vietnamese Heritage v1 identity and design keys. */
function vhSource(options: RendererFixtureSourceOptions): BuildSnapshotPayloadInput {
  const input = buildRendererFixtureSourceInput(options);
  const { design, compatibility } = VIETNAMESE_HERITAGE_V1_MANIFEST;
  return {
    ...input,
    design: {
      ...input.design,
      paletteKey: design.palettes[0] as string,
      fontPresetKey: design.fontPresets[0] as string,
      effectPresetKey: design.effectPresets[0] as string,
    },
    templateVersion: { ...input.templateVersion, rendererKey: compatibility.rendererKey },
  };
}

interface VhRenderOptions extends RendererFixtureSourceOptions {
  guest?: { displayName: string };
  unavailableMediaIds?: readonly string[];
}

async function vhFixture(options: VhRenderOptions): Promise<RendererFixture> {
  const { guest, unavailableMediaIds, ...sourceOptions } = options;
  return runRendererFixturePipeline(vhSource(sourceOptions), {
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
    // Not capable: canonical content never becomes visible.
    expect(viewModel.sections.photoStory).toBe(true);
    expect(selection.effectiveSections.photoStory).toBe(false);
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

  it("timeline: canonical steps in order when effective; hidden by staff setting or absence", async () => {
    const { html } = await renderVh({ variant: "COMMON" });
    const welcome = html.indexOf("Đón khách");
    expect(welcome).toBeGreaterThan(-1);
    expect(welcome).toBeLessThan(html.indexOf("Làm lễ"));
    expect(html.indexOf("Làm lễ")).toBeLessThan(html.indexOf("Khai tiệc"));
    expect((await renderVh({ variant: "COMMON", timeline: "ABSENT" })).html).not.toContain("Đón khách");
    expect((await renderVh({ variant: "COMMON", sectionSettings: { timeline: false } })).html).not.toContain("Đón khách");
  });

  it("media slots: cover, portraits (primary first), love-story photo, gallery and QR render their RESOLVED URLs only", async () => {
    const { html, fixture } = await renderVh(ALL_MEDIA);
    expect(html).toContain(`src="${fixtureMediaUrl(FIXTURE_MEDIA_IDS.COVER)}"`);
    expect(html).toContain('data-cover="photo"');
    const groomPortrait = html.indexOf(fixtureMediaUrl(FIXTURE_MEDIA_IDS.PORTRAIT_GROOM));
    const bridePortrait = html.indexOf(fixtureMediaUrl(FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE));
    expect(groomPortrait).toBeGreaterThan(-1);
    expect(bridePortrait).toBeGreaterThan(groomPortrait);
    expect(html).toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO));
    for (const id of [FIXTURE_MEDIA_IDS.GALLERY_1, FIXTURE_MEDIA_IDS.GALLERY_2, FIXTURE_MEDIA_IDS.GALLERY_3]) {
      expect(count(html, fixtureMediaUrl(id))).toBe(1);
    }
    expect(html).toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.QR_GROOM));
    expect(html).toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.QR_BRIDE));
    // PHOTO_STORY is referenced but VH v1 is not capable: never rendered, never reused.
    expect(fixture.viewModel.media.photoStory).toHaveLength(FIXTURE_PHOTO_STORY_IDS.length);
    for (const id of FIXTURE_PHOTO_STORY_IDS) expect(html).not.toContain(fixtureMediaUrl(id));
    // The audio reference never becomes an element.
    expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.AUDIO));
    expect(html).not.toMatch(/<audio|<button|<form/);
  });

  it("BRIDE portraits put the bride first", async () => {
    const { html } = await renderVh({ ...ALL_MEDIA, variant: "BRIDE" });
    expect(html.indexOf(fixtureMediaUrl(FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE))).toBeLessThan(
      html.indexOf(fixtureMediaUrl(FIXTURE_MEDIA_IDS.PORTRAIT_GROOM)),
    );
  });

  it("missing/UNAVAILABLE optional media degrades honestly with no substitute", async () => {
    const unavailable = [
      FIXTURE_MEDIA_IDS.COVER,
      FIXTURE_MEDIA_IDS.PORTRAIT_GROOM,
      FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO,
      FIXTURE_MEDIA_IDS.GALLERY_2,
      FIXTURE_MEDIA_IDS.QR_BRIDE,
    ];
    const { html } = await renderVh({ ...ALL_MEDIA, unavailableMediaIds: unavailable });
    for (const id of unavailable) expect(html, id).not.toContain(fixtureMediaUrl(id));
    expect(html).toContain('data-cover="none"');
    expect(html).toMatch(/portraitRow[^"]*" data-count="1"/);
    expect(html).toContain('data-photo="none"');
    // The unavailable gallery item keeps its position as a neutral tile.
    const tiles = [...html.matchAll(/galleryItem[^"]*" data-status="(\w+)"/g)].map((match) => match[1]);
    expect(tiles).toStrictEqual(["RESOLVED", "UNAVAILABLE", "RESOLVED"]);
    expect(count(html, COPY.gallery.unavailable)).toBe(1);
    // Bride bank lines stay; only her QR is gone.
    expect(html).toContain("9001000000002");

    // Unreferenced optional slots (the fixture default has no portrait or love-story photo rows).
    const none = await renderVh({ variant: "COMMON" });
    expect(none.html).not.toMatch(/portraitRow/);
    expect(none.html).toContain('data-photo="none"');
  });

  it("gift: one panel per operational side with canonical lines; GROOM shows only the groom side", async () => {
    const common = await renderVh({ variant: "COMMON" });
    expect([...common.html.matchAll(/giftPanel[^"]*" data-side="(\w+)"/g)].map((match) => match[1])).toStrictEqual(["GROOM", "BRIDE"]);
    const groom = await renderVh({ variant: "GROOM" });
    expect(groom.html).toContain("9001000000001");
    expect(groom.html).not.toContain("9001000000002");
    expect(groom.html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.QR_BRIDE));
    expect(groom.html).not.toMatch(/class="[^"]*giftSide/);
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
    expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.GALLERY_1));
    expect(html).not.toContain(fixtureMediaUrl(FIXTURE_MEDIA_IDS.LOVE_STORY_PHOTO));
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

  it("no demo, prototype or capability UI appears", async () => {
    const { html } = await renderVh(ALL_MEDIA);
    for (const forbidden of [
      "/prototypes/",
      "/renderers/",
      "demo",
      "Sơn Trà",
      "sông Hàn",
      "A Thousand Years",
      "Bạn và Gia Đình",
      "Chạm để mở",
      "Xác Nhận Tham Dự",
      "Sao chép",
    ]) {
      expect(html, forbidden).not.toContain(forbidden);
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
