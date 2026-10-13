import { describe, expect, it } from "vitest";

import { INVITATION_VARIANTS } from "../../domain";
import { PRODUCTION_RENDERER_KEYS } from "../../../templates/core/production-renderer-manifests";
import { PUBLIC_SHOWROOM_TEMPLATES } from "../showroom-catalog";
import { buildDemoRenderData, DEMO_VARIANT_SEGMENTS, isDemoVariantSegment } from "../demo/build-demo-render-data";
import { existsSync } from "node:fs";
import path from "node:path";

import { DEMO_MEDIA_BASE_PATH, DEMO_LEGACY_ROLE_PHOTO_SETS, allDemoImages, type DemoImage } from "../demo/demo-media";
import { DEMO_COUPLE, DEMO_EVENT_STARTS, buildDemoWeddingSource } from "../demo/demo-wedding-source";

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
        expect(data.viewModel.people.groom.name).toBe(DEMO_COUPLE.groomName);
        expect(data.viewModel.people.bride.name).toBe(DEMO_COUPLE.brideName);
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
      expect(data.viewModel.media.templateSlots?.groomPortrait ?? []).toStrictEqual([]);
      expect(data.viewModel.media.templateSlots?.bridePortrait ?? []).toStrictEqual([]);
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
