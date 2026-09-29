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
      "lunar-null",
      "sections-minimal",
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

  it("media states match each scenario; audio is UNAVAILABLE (no harness audio in RF-06B)", async () => {
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
  });

  it("lunar-null has no lunar text; sections-minimal turns every optional section off", async () => {
    expect((await data("lunar-null")).viewModel.ceremony.lunarDateDisplay).toBeNull();
    expect((await data("sections-minimal")).sections).toStrictEqual({
      invitationMessage: false,
      loveStory: false,
      gallery: false,
      music: false,
      gift: false,
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

  it("listed ids and audio are UNAVAILABLE; unknown ids are fixture bugs", async () => {
    const resolver = createHarnessMediaResolver([FIXTURE_MEDIA_IDS.COVER]);
    expect(await resolver.resolveMedia(FIXTURE_MEDIA_IDS.COVER)).toStrictEqual({
      status: "UNAVAILABLE",
      mediaId: FIXTURE_MEDIA_IDS.COVER,
    });
    expect((await resolver.resolveMedia(FIXTURE_MEDIA_IDS.AUDIO)).status).toBe("UNAVAILABLE");
    await expect(resolver.resolveMedia("00000000-0000-4000-8000-00000000ffff")).rejects.toThrow();
  });
});

describe("harness fixture images", () => {
  const files = readdirSync(PUBLIC_HARNESS_DIR).sort();

  it("are exactly the six fictional SVGs", () => {
    expect(files).toStrictEqual([
      "cover.svg",
      "gallery-1.svg",
      "gallery-2.svg",
      "gallery-3.svg",
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
