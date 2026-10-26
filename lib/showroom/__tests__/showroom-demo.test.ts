import { describe, expect, it } from "vitest";

import { INVITATION_VARIANTS } from "../../domain";
import { PRODUCTION_RENDERER_KEYS } from "../../../templates/core/production-renderer-manifests";
import { PUBLIC_SHOWROOM_TEMPLATES } from "../showroom-catalog";
import { buildDemoRenderData, DEMO_VARIANT_SEGMENTS, isDemoVariantSegment } from "../demo/build-demo-render-data";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  DEMO_MEDIA_BASE_PATH,
  DEMO_LEGACY_ROLE_PHOTO_SETS,
  DEMO_TEMPLATE_SLOT_PHOTO_SETS,
  allDemoImages,
  type DemoImage,
} from "../demo/demo-media";
import { lookupTemplateEditorManifest } from "../../../templates/core/production-editor-manifests";
import { DEMO_COUPLE, DEMO_EVENT_STARTS, buildDemoWeddingSource, demoCoupleFor } from "../demo/demo-wedding-source";

/** Every resolved URL anywhere in a ViewModel's media. */
function mediaUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(mediaUrls);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const own = typeof record.url === "string" ? [record.url] : [];
  return [...own, ...Object.values(record).flatMap(mediaUrls)];
}

describe("LAUNCH-P0-04 showroom demos run the real pipeline", () => {
  it("every public template × COMMON/GROOM/BRIDE renders its own exact renderer key", async () => {
    for (const template of PUBLIC_SHOWROOM_TEMPLATES) {
      for (const variant of INVITATION_VARIANTS) {
        const data = await buildDemoRenderData(template.rendererKey, variant);
        expect(data.rendererKey, `${template.templateCode} ${variant}`).toBe(template.rendererKey);
        expect(data.viewModel.variant).toBe(variant);
        expect(data.viewModel.people.groom.name).toBe(demoCoupleFor(template.rendererKey).groomName);
        expect(data.viewModel.people.bride.name).toBe(demoCoupleFor(template.rendererKey).brideName);
      }
    }
  });

  it("GROOM ceremony is Thành Hôn, BRIDE is Vu Quy; primary person follows the variant", async () => {
    for (const template of PUBLIC_SHOWROOM_TEMPLATES) {
      const groom = await buildDemoRenderData(template.rendererKey, "GROOM");
      const bride = await buildDemoRenderData(template.rendererKey, "BRIDE");
      expect(groom.viewModel.ceremony.occasionType).toBe("THANH_HON");
      expect(groom.viewModel.people.primarySide).toBe("GROOM");
      expect(bride.viewModel.ceremony.occasionType).toBe("VU_QUY");
      expect(bride.viewModel.people.primarySide).toBe("BRIDE");
    }
  });

  it("demo media are only local demo images; no QR, no audio; portraits only from a photo set", async () => {
    const allowed = new Set(allDemoImages().map((image) => `${DEMO_MEDIA_BASE_PATH}${image.file}`));
    for (const template of PUBLIC_SHOWROOM_TEMPLATES) {
      const data = await buildDemoRenderData(template.rendererKey, "COMMON");
      const urls = mediaUrls(data.viewModel.media);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) expect(allowed.has(url), url).toBe(true);
      expect(data.viewModel.media.qr).toStrictEqual({});
      expect(data.viewModel.media.audio).toBeUndefined();
      expect(data.sections.music).toBe(false);
      if (Object.hasOwn(DEMO_LEGACY_ROLE_PHOTO_SETS, template.rendererKey)) continue;
      expect(data.viewModel.media.portrait).toStrictEqual({});
      // A person-bound portrait may come only from that renderer's own slot photo set
      // (fictional people); a renderer without one keeps both portraits empty, because
      // the abstract mood images must never pose as a person.
      const slotSet = DEMO_TEMPLATE_SLOT_PHOTO_SETS[template.rendererKey];
      const declared = (slot: string) => (slotSet?.[slot] ?? []).map((image) => `${DEMO_MEDIA_BASE_PATH}${image.file}`);
      for (const slot of ["groomPortrait", "bridePortrait"]) {
        const rendered = (data.viewModel.media.templateSlots?.[slot] ?? []).map((item) => (item as { url?: string }).url);
        expect(rendered, `${template.rendererKey} ${slot}`).toStrictEqual(declared(slot));
      }
    }
  });

  it("Elegant Editorial shows its fictional photo set in every role for COMMON/GROOM/BRIDE", async () => {
    const set = DEMO_LEGACY_ROLE_PHOTO_SETS["wedding.elegant-editorial.v1"];
    expect(set).toBeDefined();
    if (set === undefined) return;
    const url = (image: DemoImage) => `${DEMO_MEDIA_BASE_PATH}${image.file}`;
    const urlOf = (item: unknown) => (item as { status: string; url?: string }).url;
    for (const variant of INVITATION_VARIANTS) {
      const { viewModel } = await buildDemoRenderData("wedding.elegant-editorial.v1", variant);
      const { media } = viewModel;
      expect(urlOf(media.cover), variant).toBe(url(set.cover));
      // Portraits are bound by explicit side, never by variant order.
      expect(urlOf(media.portrait.groom)).toBe(url(set.groomPortrait));
      expect(urlOf(media.portrait.bride)).toBe(url(set.bridePortrait));
      expect(media.photoStory.map(urlOf)).toStrictEqual(set.photoStory.map(url));
      expect(urlOf(media.loveStoryPhoto)).toBe(url(set.loveStoryPhoto));
      expect(media.gallery.map(urlOf)).toStrictEqual(set.gallery.map(url));
    }
    expect(new Set(set.gallery.map(url)).size).toBe(set.gallery.length);
    expect(set.gallery.length).toBeGreaterThanOrEqual(10);
  });

  it("Vietnamese Heritage shows its fictional photo set slot by slot for COMMON/GROOM/BRIDE", async () => {
    const set = DEMO_TEMPLATE_SLOT_PHOTO_SETS["wedding.vietnamese-heritage.v2"];
    expect(set).toBeDefined();
    if (set === undefined) return;
    const url = (image: DemoImage) => `${DEMO_MEDIA_BASE_PATH}${image.file}`;
    const urlOf = (item: unknown) => (item as { status: string; url?: string }).url;
    const prefix = (image: DemoImage) => image.file.split("/").pop()?.slice(0, 2);
    const file = (n: number) => set.gallery?.find((image) => prefix(image) === String(n).padStart(2, "0"))?.file ?? "";
    // Gallery: all ten in file-number order except 05/06 swapped (landscape 05 on the wide row).
    expect(set.gallery?.map(prefix)).toStrictEqual(["01", "02", "03", "04", "06", "05", "07", "08", "09", "10"]);
    expect(set.heroPhoto?.map((image) => image.file)).toStrictEqual([file(1)]);
    expect(set.portraitCluster?.map((image) => image.file)).toStrictEqual([file(4), file(2), file(3)]);
    expect(set.loveStoryPhoto?.map((image) => image.file)).toStrictEqual([file(5)]);
    for (const variant of INVITATION_VARIANTS) {
      const { viewModel } = await buildDemoRenderData("wedding.vietnamese-heritage.v2", variant);
      const slots = viewModel.media.templateSlots ?? {};
      for (const [slotKey, images] of Object.entries(set)) {
        expect((slots[slotKey] ?? []).map(urlOf), `${variant} ${slotKey}`).toStrictEqual(images.map(url));
      }
      expect(viewModel.media.portrait).toStrictEqual({});
    }
  });

  it("Romantic Minimal shows its fictional photo set slot by slot for COMMON/GROOM/BRIDE", async () => {
    const set = DEMO_TEMPLATE_SLOT_PHOTO_SETS["wedding.romantic-minimal.v1"];
    expect(set).toBeDefined();
    if (set === undefined) return;
    const url = (image: DemoImage) => `${DEMO_MEDIA_BASE_PATH}${image.file}`;
    const urlOf = (item: unknown) => (item as { status: string; url?: string }).url;
    const name = (image: DemoImage) => image.file.split("/").pop()?.replace(/\.webp$/, "");
    expect(set.saveTheDatePhoto?.map(name)).toStrictEqual(["01-save-the-date-umbrella-couple"]);
    expect(set.justMarriedPhoto?.map(name)).toStrictEqual(["02-just-married-garden-couple"]);
    expect(set.ourLovePhotos?.map(name)).toStrictEqual([
      "03-our-love-bride-golden-garden",
      "04-our-love-lakeside-couple",
      "05-our-love-groom-garden",
    ]);
    expect(set.thankYouPhoto?.map(name)).toStrictEqual(["10-thank-you-ivory-bow"]);
    // All ten distinct photographs, each file once.
    const gallery = set.gallery?.map(name) ?? [];
    expect(gallery.map((file) => file?.slice(0, 2)).sort()).toStrictEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
    expect(new Set(Object.values(set).flat().map((image) => image.file)).size).toBe(10);
    for (const image of Object.values(set).flat()) {
      const landscape = image.file.includes("/02-") || image.file.includes("/10-");
      expect([image.width, image.height, image.orientation], image.file).toStrictEqual(
        landscape ? [1448, 1086, "LANDSCAPE"] : [1024, 1536, "PORTRAIT"],
      );
    }
    for (const variant of INVITATION_VARIANTS) {
      const { viewModel } = await buildDemoRenderData("wedding.romantic-minimal.v1", variant);
      const slots = viewModel.media.templateSlots ?? {};
      for (const [slotKey, images] of Object.entries(set)) {
        expect((slots[slotKey] ?? []).map(urlOf), `${variant} ${slotKey}`).toStrictEqual(images.map(url));
      }
    }
  });

  it("the Vietnamese Heritage demo runs v2 and shows only Gia Huy / Khánh Linh, in variant order", async () => {
    const vh = PUBLIC_SHOWROOM_TEMPLATES.find((template) => template.templateCode === "vietnamese-heritage");
    expect(vh?.rendererKey).toBe("wedding.vietnamese-heritage.v2");
    const order = { COMMON: ["Gia Huy", "Khánh Linh"], GROOM: ["Gia Huy", "Khánh Linh"], BRIDE: ["Khánh Linh", "Gia Huy"] } as const;
    for (const variant of INVITATION_VARIANTS) {
      const { viewModel } = await buildDemoRenderData("wedding.vietnamese-heritage.v2", variant);
      expect([viewModel.people.primary.name, viewModel.people.secondary.name], variant).toStrictEqual([...order[variant]]);
      const text = JSON.stringify(viewModel);
      expect(text, variant).not.toMatch(/Trần Gia Huy|Nguyễn Khánh Linh|TRAN GIA HUY|NGUYEN KHANH LINH/);
    }
    const { input } = buildDemoWeddingSource("wedding.vietnamese-heritage.v2", "COMMON");
    expect([input.weddingDetails?.groomBankAccountName, input.weddingDetails?.brideBankAccountName]).toStrictEqual(["GIA HUY", "KHANH LINH"]);
  });

  it("the short names are a VH-only override: every other demo keeps the shared couple", () => {
    for (const template of PUBLIC_SHOWROOM_TEMPLATES.filter((entry) => entry.templateCode !== "vietnamese-heritage")) {
      expect(demoCoupleFor(template.rendererKey)).toMatchObject(DEMO_COUPLE);
    }
    expect(demoCoupleFor("wedding.vietnamese-heritage.v1")).toMatchObject(DEMO_COUPLE);
  });

  it("the Our Wedding Story demo runs v2 on its own fictional photo set, identical for every variant", async () => {
    const ows = PUBLIC_SHOWROOM_TEMPLATES.find((template) => template.templateCode === "our-wedding-story");
    expect(ows?.rendererKey).toBe("wedding.our-wedding-story.v2");
    const set = DEMO_TEMPLATE_SLOT_PHOTO_SETS["wedding.our-wedding-story.v2"];
    expect(set).toBeDefined();
    if (set === undefined) return;
    // v1 keeps the abstract mood images: the new photography is wired to v2 alone.
    expect(Object.hasOwn(DEMO_TEMPLATE_SLOT_PHOTO_SETS, "wedding.our-wedding-story.v1")).toBe(false);
    expect(Object.hasOwn(DEMO_LEGACY_ROLE_PHOTO_SETS, "wedding.our-wedding-story.v2")).toBe(false);

    const file = (slot: string, index = 0) => set[slot]?.[index]?.file;
    expect(file("coverPhoto")).toBe("our-wedding-story/photos/01-cover-couple-fullbody.webp");
    // Person-bound (OWS-01): the groom's frame is the groom's, the bride's is the bride's.
    expect(file("groomPortrait")).toBe("our-wedding-story/photos/04-groom-portrait.webp");
    expect(file("bridePortrait")).toBe("our-wedding-story/photos/03-bride-portrait.webp");
    expect(file("storyPhoto")).toBe("our-wedding-story/photos/09-editorial-seated-wide.webp");
    expect(file("thankYouPhoto")).toBe("our-wedding-story/photos/10-thank-you-couple.webp");
    // All ten frames, each exactly once, in the approved album order.
    expect(set.gallery?.map((image) => image.file)).toStrictEqual([
      "our-wedding-story/photos/05-magazine-couple.webp",
      "our-wedding-story/photos/06-camera-couple.webp",
      "our-wedding-story/photos/07-fashion-couple-wide.webp",
      "our-wedding-story/photos/08-intimate-veil-couple.webp",
      "our-wedding-story/photos/02-veil-couple.webp",
      "our-wedding-story/photos/09-editorial-seated-wide.webp",
      "our-wedding-story/photos/03-bride-portrait.webp",
      "our-wedding-story/photos/04-groom-portrait.webp",
      "our-wedding-story/photos/01-cover-couple-fullbody.webp",
      "our-wedding-story/photos/10-thank-you-couple.webp",
    ]);
    expect(new Set(set.gallery?.map((image) => image.file)).size).toBe(10);
    // The slot declared LANDSCAPE gets a real landscape frame.
    expect(set.storyPhoto?.[0]?.orientation).toBe("LANDSCAPE");

    for (const variant of INVITATION_VARIANTS) {
      const v2 = await buildDemoRenderData("wedding.our-wedding-story.v2", variant);
      const slots = v2.viewModel.media.templateSlots ?? {};
      const urls = Object.values(slots).flat().map((item) => (item as { url?: string }).url);
      expect(urls.length).toBeGreaterThan(0);
      // Every frame is one of the new local WebP photographs — never a mood image.
      for (const url of urls) expect(url, variant).toMatch(/^\/showroom\/demo\/our-wedding-story\/photos\/\d\d-[\w-]+\.webp$/);
      expect((slots.groomPortrait ?? []).map((item) => (item as { url?: string }).url), variant).toStrictEqual([
        "/showroom/demo/our-wedding-story/photos/04-groom-portrait.webp",
      ]);
      expect((slots.bridePortrait ?? []).map((item) => (item as { url?: string }).url), variant).toStrictEqual([
        "/showroom/demo/our-wedding-story/photos/03-bride-portrait.webp",
      ]);
      expect((slots.gallery ?? []).length, variant).toBe(10);
    }
  });

  it("the Se Duyên demo runs v1 on the Vietnamese Heritage photo set, slot by slot for COMMON/GROOM/BRIDE", async () => {
    const sd = PUBLIC_SHOWROOM_TEMPLATES.find((template) => template.templateCode === "se-duyen");
    expect(sd?.rendererKey).toBe("wedding.se-duyen.v1");
    const set = DEMO_TEMPLATE_SLOT_PHOTO_SETS["wedding.se-duyen.v1"];
    expect(set).toBeDefined();
    if (set === undefined) return;
    const url = (image: DemoImage) => `${DEMO_MEDIA_BASE_PATH}${image.file}`;
    const urlOf = (item: unknown) => (item as { status: string; url?: string }).url;
    const file = (slot: string, index = 0) => set[slot]?.[index]?.file;
    const frames = Object.values(set).flat();

    // SD-V1-SHOWROOM-01: the set is the Vietnamese Heritage photographs reused by
    // reference — no Se Duyên folder, no copied bytes — so every frame must be one
    // of that set's committed files (provenance: `lib/showroom/demo/ASSETS.md`).
    const vh = DEMO_TEMPLATE_SLOT_PHOTO_SETS["wedding.vietnamese-heritage.v2"];
    const vhFiles = new Set(Object.values(vh ?? {}).flat().map((image) => image.file));
    expect(vhFiles.size).toBe(10);
    for (const image of frames) {
      expect(image.file, image.file).toMatch(/^vietnamese-heritage\/photos\/\d\d-[\w-]+\.webp$/);
      expect(vhFiles.has(image.file), image.file).toBe(true);
    }

    expect(file("openingPhoto")).toBe("vietnamese-heritage/photos/01-cover-doi-uyen-uong-ao-dai-tren-nen-do.webp");
    // Positions, not people: the couple page's large frame and the small frame
    // overlapping its lower corner. Se Duyên declares no person-bound slot, so
    // nothing here is read as "the groom's photo" or "the bride's photo".
    expect(file("portraitLead")).toBe("vietnamese-heritage/photos/02-couple-portrait-ao-dai-sac-do-le-hoi.webp");
    expect(file("portraitAside")).toBe("vietnamese-heritage/photos/07-couple-ao-dai-red-lanterns.webp");
    expect(file("closingPhoto")).toBe("vietnamese-heritage/photos/10-playful-couple-ao-dai-red-black.webp");
    // The album is four frames — lead, a tall/small pair, then a wide foot frame —
    // drawn from the first four of the slot in order, so the landscape tea ceremony
    // sits last where the wide crop belongs.
    expect(set.gallery?.map((image) => image.file)).toStrictEqual([
      "vietnamese-heritage/photos/08-couple-portrait-with-double-happiness.webp",
      "vietnamese-heritage/photos/03-bride-portrait-ao-dai-do-quat-xep.webp",
      "vietnamese-heritage/photos/04-groom-portrait-chu-re-ben-chu-hy-do.webp",
      "vietnamese-heritage/photos/05-tea-ceremony-traditional-vietnamese.webp",
    ]);
    expect(set.gallery?.[3]?.orientation).toBe("LANDSCAPE");
    expect(new Set(frames.map((image) => image.file)).size).toBe(frames.length);
    // Exactly the five declared slots, no person-bound portrait slot among them.
    expect(Object.keys(set).sort()).toStrictEqual(["closingPhoto", "gallery", "openingPhoto", "portraitAside", "portraitLead"]);

    for (const variant of INVITATION_VARIANTS) {
      const { viewModel } = await buildDemoRenderData("wedding.se-duyen.v1", variant);
      const slots = viewModel.media.templateSlots ?? {};
      // Identical for every variant: the photographs are bound to frames, and only
      // the names, family blocks and ceremony wording follow COMMON/GROOM/BRIDE.
      for (const [slotKey, images] of Object.entries(set)) {
        expect((slots[slotKey] ?? []).map(urlOf), `${variant} ${slotKey}`).toStrictEqual(images.map(url));
      }
      expect(Object.keys(slots).sort(), variant).toStrictEqual(Object.keys(set).sort());
      expect(viewModel.media.portrait, variant).toStrictEqual({});
    }
  });

  it("every slot photo set names only declared slots within maxCount", () => {
    for (const [rendererKey, set] of Object.entries(DEMO_TEMPLATE_SLOT_PHOTO_SETS)) {
      const editor = lookupTemplateEditorManifest(rendererKey);
      expect(editor?.mediaModel, rendererKey).toBe("TEMPLATE_SLOTS");
      for (const [slotKey, images] of Object.entries(set)) {
        const slot = editor?.mediaSlots.find((candidate) => candidate.key === slotKey);
        expect(slot, `${rendererKey} ${slotKey}`).toBeDefined();
        if (slot?.maxCount !== null && slot?.maxCount !== undefined) expect(images.length).toBeLessThanOrEqual(slot.maxCount);
      }
    }
  });

  it("every demo image file exists under public/", () => {
    for (const image of allDemoImages()) {
      expect(existsSync(path.join(process.cwd(), "public", DEMO_MEDIA_BASE_PATH, image.file)), image.file).toBe(true);
    }
  });

  it("demo bank details are visibly demo-only and every map link is an https Google Maps search", () => {
    const { input } = buildDemoWeddingSource(PRODUCTION_RENDERER_KEYS[0] ?? "", "COMMON");
    expect(input.weddingDetails?.groomBankName).toContain("Demo");
    expect(input.weddingDetails?.brideBankName).toContain("Demo");
    for (const event of input.events) {
      expect(event.mapUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
    }
  });

  it("an unregistered renderer key fails closed", () => {
    expect(() => buildDemoWeddingSource("wedding.elegant-editorial.v9", "COMMON")).toThrow();
  });

  it("variant URL segments are exactly nha-trai → GROOM and nha-gai → BRIDE", () => {
    expect(DEMO_VARIANT_SEGMENTS).toStrictEqual({ "nha-trai": "GROOM", "nha-gai": "BRIDE" });
    expect(isDemoVariantSegment("nha-trai")).toBe(true);
    expect(isDemoVariantSegment("GROOM")).toBe(false);
    expect(isDemoVariantSegment("constructor")).toBe(false);
  });

  /**
   * Freshness guard (intentionally uses the real clock): a showroom demo
   * whose wedding already happened shows a finished countdown. Fails 60 days
   * before the earliest demo event so the dates (and their verbatim lunar
   * text) are moved in time.
   */
  it("demo wedding dates are still at least 60 days in the future", () => {
    const earliest = Math.min(...Object.values(DEMO_EVENT_STARTS).map((iso) => Date.parse(iso)));
    expect(earliest - Date.now()).toBeGreaterThan(60 * 24 * 60 * 60 * 1000);
  });
});
