import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRODUCTION_RENDERER_KEYS } from "../../../../templates/core/production-renderer-manifests";
import { FIXTURE_GUESTS, FIXTURE_MEDIA_IDS } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import {
  DEFAULT_HARNESS_SCENARIO_ID,
  HARNESS_MEDIA_BASE_PATH,
  HARNESS_SCENARIOS,
  HARNESS_SCENARIO_IDS,
  buildHarnessRenderData,
  createHarnessMediaResolver,
  isHarnessScenarioId,
  type HarnessScenarioId,
} from "../harness-scenarios";

/**
 * RF-06B internal harness scenarios (docs/DECISIONS.md "RF-06-0 …" P23,
 * P38): the real pure pipeline, serializable output only, deterministic
 * harness-owned media, no network.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const PUBLIC_HARNESS_DIR = join(REPO_ROOT, "public", "internal", "renderer-harness");

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("scenario set", () => {
  it("covers the required deterministic scenarios", () => {
    expect(HARNESS_SCENARIO_IDS).toStrictEqual([
      "common-full",
      "groom",
      "bride",
      "long-guest",
      "cover-unavailable",
      "gallery-unavailable",
      "qr-unavailable",
      "portrait-unavailable",
      "gallery-many",
      "lunar-null",
      "sections-minimal",
      "music-resolved",
    ]);
    expect(DEFAULT_HARNESS_SCENARIO_ID).toBe("common-full");
  });

  it("scenario ids are exact-match selectors only", () => {
    expect(isHarnessScenarioId("groom")).toBe(true);
    for (const value of ["GROOM", "groom ", "toString", "__proto__", "constructor", "", "Anh Tuấn và gia đình"]) {
      expect(isHarnessScenarioId(value), value).toBe(false);
    }
  });

  it.each(HARNESS_SCENARIO_IDS)("%s: builds through the real pipeline to serializable host data", async (id) => {
    const data = await buildHarnessRenderData(id);
    expect(Object.keys(data).sort()).toStrictEqual(["rendererKey", "sections", "viewModel"]);
    expect(PRODUCTION_RENDERER_KEYS).toContain(data.rendererKey);
    expect(JSON.parse(JSON.stringify(data))).toStrictEqual(data);
    expect(data.viewModel.variant).toBe(HARNESS_SCENARIOS[id].source.variant);
    expect(JSON.stringify(data)).not.toMatch(/token|guestId|service_role|supabase|\.invalid\/media/i);
  });

  it("is deterministic", async () => {
    for (const id of HARNESS_SCENARIO_IDS) {
      expect(await buildHarnessRenderData(id)).toStrictEqual(await buildHarnessRenderData(id));
    }
  });
});

describe("scenario content", () => {
  async function data(id: HarnessScenarioId) {
    return buildHarnessRenderData(id);
  }

  it("guest overlays come only from the fixed fictional fixtures", async () => {
    expect((await data("common-full")).viewModel.guest).toStrictEqual(FIXTURE_GUESTS.NORMAL);
    expect((await data("bride")).viewModel.guest).toStrictEqual(FIXTURE_GUESTS.PLAYFUL);
    expect((await data("long-guest")).viewModel.guest).toStrictEqual(FIXTURE_GUESTS.LONG);
    expect((await data("groom")).viewModel.guest).toBeUndefined();
  });

  // RF7 Product Owner amendment: the honest end-to-end portrait path (fixture rows → Snapshot refs →
  // harness resolver → ViewModel slots) for the scenarios the visual Couple checkpoint will preview.
  it("portraits: common-full / groom / bride resolve both fictional harness portraits; portrait-unavailable keeps the slot", async () => {
    for (const id of ["common-full", "groom", "bride"] as const) {
      const { viewModel } = await data(id);
      expect(viewModel.media.portrait.groom, id).toMatchObject({
        status: "RESOLVED",
        mediaId: FIXTURE_MEDIA_IDS.PORTRAIT_GROOM,
        url: `${HARNESS_MEDIA_BASE_PATH}portrait-groom.svg`,
        width: 900,
        height: 1200,
      });
      expect(viewModel.media.portrait.bride, id).toMatchObject({
        status: "RESOLVED",
        mediaId: FIXTURE_MEDIA_IDS.PORTRAIT_BRIDE,
        url: `${HARNESS_MEDIA_BASE_PATH}portrait-bride.svg`,
      });
    }
    const unavailable = (await data("portrait-unavailable")).viewModel.media.portrait;
    expect(unavailable.groom).toStrictEqual({ status: "UNAVAILABLE", mediaId: FIXTURE_MEDIA_IDS.PORTRAIT_GROOM });
    expect(unavailable.bride?.status).toBe("RESOLVED");
    // Every other scenario keeps the pre-portrait data: no portrait rows, two absent slots.
    for (const id of ["long-guest", "cover-unavailable", "lunar-null", "sections-minimal"] as const) {
      expect((await data(id)).viewModel.media.portrait, id).toStrictEqual({});
    }
  });

  it("[media-batch] common-full resolves the Photo Story and Love Story photo; gallery-many resolves all 25 gallery images", async () => {
    const full = (await data("common-full")).viewModel.media;
    expect(full.photoStory.map((item) => item.status)).toStrictEqual(Array(5).fill("RESOLVED"));
    expect(full.photoStory.map((item) => (item.status === "RESOLVED" ? item.url : ""))).toStrictEqual(
      [1, 2, 3, 4, 5].map((i) => `${HARNESS_MEDIA_BASE_PATH}photo-story-${i}.svg`),
    );
    expect(full.loveStoryPhoto).toMatchObject({ status: "RESOLVED", url: `${HARNESS_MEDIA_BASE_PATH}love-story.svg` });
    const many = (await data("gallery-many")).viewModel.media.gallery;
    expect(many).toHaveLength(25);
    expect(many.every((item) => item.status === "RESOLVED")).toBe(true);
  });

  it("media states match each scenario; audio is UNAVAILABLE outside music-resolved", async () => {
    const full = await data("common-full");
    expect(full.viewModel.media.cover).toMatchObject({ status: "RESOLVED", url: `${HARNESS_MEDIA_BASE_PATH}cover.svg` });
    expect(full.viewModel.media.audio).toStrictEqual({ status: "UNAVAILABLE", mediaId: FIXTURE_MEDIA_IDS.AUDIO });
    expect((await data("cover-unavailable")).viewModel.media.cover?.status).toBe("UNAVAILABLE");
    expect((await data("gallery-unavailable")).viewModel.media.gallery.map((item) => item.status)).toStrictEqual([
      "RESOLVED",
      "UNAVAILABLE",
      "RESOLVED",
    ]);
    const qr = (await data("qr-unavailable")).viewModel.media.qr;
    expect(qr.groom?.status).toBe("UNAVAILABLE");
    expect(qr.bride?.status).toBe("RESOLVED");
    // RF-06D: only music-resolved opts into the local harness tone.
    for (const id of HARNESS_SCENARIO_IDS) {
      const audio = (await data(id)).viewModel.media.audio;
      if (id === "music-resolved") {
        expect(audio).toStrictEqual({
          status: "RESOLVED",
          mediaId: FIXTURE_MEDIA_IDS.AUDIO,
          url: `${HARNESS_MEDIA_BASE_PATH}audio-tone.wav`,
          width: null,
          height: null,
        });
      } else {
        expect(audio, id).toStrictEqual({ status: "UNAVAILABLE", mediaId: FIXTURE_MEDIA_IDS.AUDIO });
      }
    }
    expect((await data("music-resolved")).sections.music).toBe(true);
  });

  it("lunar-null has no lunar text; sections-minimal turns every optional section off", async () => {
    expect((await data("lunar-null")).viewModel.ceremony.lunarDateDisplay).toBeNull();
    expect((await data("sections-minimal")).sections).toStrictEqual({
      invitationMessage: false,
      loveStory: false,
      gallery: false,
      music: false,
      gift: false,
      timeline: false,
      dressCode: false,
      photoStory: false,
    });
  });
});

describe("harness media resolver", () => {
  it("maps fixture images to harness-owned local paths only", async () => {
    const resolver = createHarnessMediaResolver();
    for (const id of [
      FIXTURE_MEDIA_IDS.COVER,
      FIXTURE_MEDIA_IDS.GALLERY_1,
      FIXTURE_MEDIA_IDS.GALLERY_2,
      FIXTURE_MEDIA_IDS.GALLERY_3,
      FIXTURE_MEDIA_IDS.QR_GROOM,
      FIXTURE_MEDIA_IDS.QR_BRIDE,
    ]) {
      const result = await resolver.resolveMedia(id);
      expect(result.status).toBe("RESOLVED");
      if (result.status !== "RESOLVED") continue;
      expect(result.url.startsWith(HARNESS_MEDIA_BASE_PATH)).toBe(true);
      expect(result.url).not.toMatch(/renderers|prototypes|:\/\//);
      expect(existsSync(join(REPO_ROOT, "public", result.url))).toBe(true);
    }
  });

  it("listed ids and (by default) audio are UNAVAILABLE; unknown ids are fixture bugs", async () => {
    const resolver = createHarnessMediaResolver([FIXTURE_MEDIA_IDS.COVER]);
    expect(await resolver.resolveMedia(FIXTURE_MEDIA_IDS.COVER)).toStrictEqual({
      status: "UNAVAILABLE",
      mediaId: FIXTURE_MEDIA_IDS.COVER,
    });
    expect((await resolver.resolveMedia(FIXTURE_MEDIA_IDS.AUDIO)).status).toBe("UNAVAILABLE");
    await expect(resolver.resolveMedia("00000000-0000-4000-8000-00000000ffff")).rejects.toThrow();
  });

  it("RF-06D: resolveAudio maps the fixture audio to the local harness tone only", async () => {
    const result = await createHarnessMediaResolver([], { resolveAudio: true }).resolveMedia(FIXTURE_MEDIA_IDS.AUDIO);
    expect(result).toStrictEqual({
      status: "RESOLVED",
      mediaId: FIXTURE_MEDIA_IDS.AUDIO,
      url: `${HARNESS_MEDIA_BASE_PATH}audio-tone.wav`,
      width: null,
      height: null,
    });
    if (result.status !== "RESOLVED") return;
    expect(result.url).not.toMatch(/renderers|prototypes|:\/\//);
    expect(existsSync(join(REPO_ROOT, "public", result.url))).toBe(true);
    // An explicit unavailable listing still wins over the opt-in.
    const listed = createHarnessMediaResolver([FIXTURE_MEDIA_IDS.AUDIO], { resolveAudio: true });
    expect((await listed.resolveMedia(FIXTURE_MEDIA_IDS.AUDIO)).status).toBe("UNAVAILABLE");
    expect((await createHarnessMediaResolver([], { resolveAudio: false }).resolveMedia(FIXTURE_MEDIA_IDS.AUDIO)).status).toBe(
      "UNAVAILABLE",
    );
  });
});

describe("harness fixture images", () => {
  // RF-06D: the directory also holds the harness audio tone (harness-audio-fixture.test.ts).
  const files = readdirSync(PUBLIC_HARNESS_DIR)
    .filter((file) => file.endsWith(".svg"))
    .sort();

  it("the directory is exactly the fourteen fictional SVGs plus the RF-06D harness tone", () => {
    expect(readdirSync(PUBLIC_HARNESS_DIR).sort()).toStrictEqual([...files, "audio-tone.wav"].sort());
  });

  it("are exactly the fourteen fictional SVGs", () => {
    expect(files).toStrictEqual([
      "cover.svg",
      "gallery-1.svg",
      "gallery-2.svg",
      "gallery-3.svg",
      "love-story.svg",
      "photo-story-1.svg",
      "photo-story-2.svg",
      "photo-story-3.svg",
      "photo-story-4.svg",
      "photo-story-5.svg",
      "portrait-bride.svg",
      "portrait-groom.svg",
      "qr-bride.svg",
      "qr-groom.svg",
    ]);
  });

  it.each(files)("%s is a small self-contained SVG with no script or external reference", (file) => {
    const svg = readFileSync(join(PUBLIC_HARNESS_DIR, file), "utf8");
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.length).toBeLessThan(4096);
    expect(svg).toMatch(/<title>Renderer harness fixture image: [^<]*\(fictional/);
    const withoutNamespace = svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
    expect(withoutNamespace).not.toMatch(/https?:|<script|<image|href=|url\(|<foreignObject|on\w+=/i);
  });
});
