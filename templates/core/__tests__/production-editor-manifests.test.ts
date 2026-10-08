import { describe, expect, it } from "vitest";

import { TemplateEditorManifestInvariantError, type TemplateEditorManifestV1 } from "../editor-manifest";
import {
  PRODUCTION_EDITOR_MANIFEST_ERROR_MESSAGES as M,
  PRODUCTION_EDITOR_MANIFESTS,
  createProductionEditorRegistry,
  lookupTemplateEditorManifest,
  validateProductionEditorManifests,
} from "../production-editor-manifests";
import { PRODUCTION_RENDERER_KEYS, PRODUCTION_RENDERER_MANIFESTS } from "../production-renderer-manifests";
import type { RendererProductionManifestV1 } from "../renderer-manifest";
import { ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST } from "../../editor/wedding/elegant-editorial-v1";
import { VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST } from "../../editor/wedding/vietnamese-heritage-v1";

/** TE-02 — production editor registry and the two production editor manifests (docs/DECISIONS.md "TE-02"). */

const EE_KEY = "wedding.elegant-editorial.v1";
const VH_KEY = "wedding.vietnamese-heritage.v1";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectFail(run: () => unknown, message: string): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TemplateEditorManifestInvariantError);
  expect((caught as Error).message).toBe(message);
}

/** A renderer manifest list with one capability switched off for one key. */
function withCapability(rendererKey: string, section: string, value: boolean): RendererProductionManifestV1[] {
  return PRODUCTION_RENDERER_MANIFESTS.map((manifest) => {
    if (manifest.compatibility.rendererKey !== rendererKey) return manifest;
    const copy = clone(manifest) as unknown as {
      compatibility: { sectionCapabilities: Record<string, boolean> };
    };
    copy.compatibility.sectionCapabilities[section] = value;
    return copy as unknown as RendererProductionManifestV1;
  });
}

const EDITORS = [ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST, VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST];

describe("E. production editor registry / cross-manifest validation", () => {
  it("editor key list equals the production renderer key list, in order", () => {
    expect(PRODUCTION_EDITOR_MANIFESTS.map((manifest) => manifest.rendererKey)).toStrictEqual([...PRODUCTION_RENDERER_KEYS]);
    expect([...PRODUCTION_RENDERER_KEYS]).toStrictEqual([EE_KEY, VH_KEY]);
  });

  it("the production list is frozen and holds fresh validated copies", () => {
    expect(Object.isFrozen(PRODUCTION_EDITOR_MANIFESTS)).toBe(true);
    expect(PRODUCTION_EDITOR_MANIFESTS[0]).not.toBe(ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST);
    expect(PRODUCTION_EDITOR_MANIFESTS[0]).toStrictEqual(ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST);
    expect(PRODUCTION_EDITOR_MANIFESTS[1]).toStrictEqual(VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST);
    for (const manifest of PRODUCTION_EDITOR_MANIFESTS) {
      expect(Object.isFrozen(manifest)).toBe(true);
      expect(Object.isFrozen(manifest.mediaSlots)).toBe(true);
    }
  });

  it("rejects a non-array list", () => {
    expectFail(() => validateProductionEditorManifests({} as unknown as unknown[], PRODUCTION_RENDERER_MANIFESTS), M.MANIFEST_LIST);
  });

  it("rejects a duplicate rendererKey", () => {
    expectFail(
      () => validateProductionEditorManifests([...EDITORS, ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST], PRODUCTION_RENDERER_MANIFESTS),
      M.DUPLICATE_RENDERER_KEY,
    );
  });

  it("rejects a missing editor manifest", () => {
    expectFail(() => validateProductionEditorManifests([ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST], PRODUCTION_RENDERER_MANIFESTS), M.MISSING_EDITOR_MANIFEST);
  });

  it("rejects an orphan editor manifest (exact key; no normalization or alias)", () => {
    for (const rendererKey of ["wedding.romantic-minimal.v1", "wedding.elegant-editorial.v2", "Wedding.elegant-editorial.v1", "wedding.elegant-editorial"]) {
      const orphan = { ...clone(ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST), rendererKey };
      expectFail(() => validateProductionEditorManifests([...EDITORS, orphan], PRODUCTION_RENDERER_MANIFESTS), M.ORPHAN_EDITOR_MANIFEST);
    }
  });

  it("rejects an order different from the production renderer manifests", () => {
    expectFail(() => validateProductionEditorManifests([...EDITORS].reverse(), PRODUCTION_RENDERER_MANIFESTS), M.ORDER_MISMATCH);
  });

  it("rejects a malformed editor manifest with the validator's own error", () => {
    const broken = { ...clone(VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST), mediaSlots: [] };
    expect(() => validateProductionEditorManifests([ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST, broken], PRODUCTION_RENDERER_MANIFESTS)).toThrow(
      TemplateEditorManifestInvariantError,
    );
  });

  it("rejects a section-backed content item whose section is not capable", () => {
    expectFail(() => validateProductionEditorManifests(EDITORS, withCapability(EE_KEY, "loveStory", false)), M.CONTENT_SECTION_NOT_CAPABLE);
    expectFail(() => validateProductionEditorManifests(EDITORS, withCapability(VH_KEY, "music", false)), M.CONTENT_SECTION_NOT_CAPABLE);
    const withMessage = clone(VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST) as unknown as { contentItems: unknown[] };
    withMessage.contentItems.push({ key: "INVITATION_MESSAGE", label: "Lời mời", hint: "Lời mời.", requirement: "OPTIONAL", sectionKey: "invitationMessage" });
    expectFail(
      () => validateProductionEditorManifests([ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST, withMessage], PRODUCTION_RENDERER_MANIFESTS),
      M.CONTENT_SECTION_NOT_CAPABLE,
    );
  });

  it("rejects a section-linked media slot whose section is not capable", () => {
    expectFail(() => validateProductionEditorManifests(EDITORS, withCapability(VH_KEY, "gallery", false)), M.SLOT_SECTION_NOT_CAPABLE);
    const photoStorySlot = clone(VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST) as unknown as { mediaSlots: Record<string, unknown>[] };
    photoStorySlot.mediaSlots.push({ ...photoStorySlot.mediaSlots[3], key: "storyStrip", sectionKey: "photoStory" });
    expectFail(
      () => validateProductionEditorManifests([ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST, photoStorySlot], PRODUCTION_RENDERER_MANIFESTS),
      M.SLOT_SECTION_NOT_CAPABLE,
    );
  });

  it("lookup is exact-key, registry-owned and has no fallback", () => {
    expect(lookupTemplateEditorManifest(EE_KEY)).toStrictEqual(PRODUCTION_EDITOR_MANIFESTS[0]);
    expect(lookupTemplateEditorManifest(VH_KEY)).toStrictEqual(PRODUCTION_EDITOR_MANIFESTS[1]);
    expect(Object.isFrozen(lookupTemplateEditorManifest(VH_KEY)?.mediaSlots[0])).toBe(true);
    expect(lookupTemplateEditorManifest(VH_KEY)).toBe(lookupTemplateEditorManifest(VH_KEY));
    for (const key of ["", "wedding.vietnamese-heritage", "wedding.vietnamese-heritage.v2", ` ${VH_KEY}`, VH_KEY.toUpperCase(), "latest"]) {
      expect(lookupTemplateEditorManifest(key)).toBeUndefined();
    }
  });

  it("a registry built from caller objects is unaffected by later mutation", () => {
    const editors = clone(EDITORS) as unknown as TemplateEditorManifestV1[];
    const registry = createProductionEditorRegistry(editors, PRODUCTION_RENDERER_MANIFESTS);
    (editors[1] as unknown as { mediaSlots: Record<string, unknown>[] }).mediaSlots[1]!.maxCount = 9;
    expect(registry.lookupEditorManifest(VH_KEY)?.mediaSlots[1]?.maxCount).toBe(3);
  });
});

describe("F. exact production editor manifests", () => {
  it("Elegant Editorial v1: LEGACY_ROLES, no slots, exact content items", () => {
    const manifest = lookupTemplateEditorManifest(EE_KEY);
    expect(manifest?.schemaVersion).toBe(1);
    expect(manifest?.mediaModel).toBe("LEGACY_ROLES");
    expect(manifest?.mediaSlots).toStrictEqual([]);
    expect(manifest?.contentItems.map((item) => [item.key, item.requirement, item.sectionKey])).toStrictEqual([
      ["COUPLE", "REQUIRED", null],
      ["EVENTS", "REQUIRED", null],
      ["FAMILIES", "RECOMMENDED", null],
      ["LOVE_STORY", "OPTIONAL", "loveStory"],
      ["TIMELINE", "OPTIONAL", "timeline"],
      ["DRESS_CODE", "OPTIONAL", "dressCode"],
      ["GIFT", "OPTIONAL", "gift"],
      ["MUSIC", "OPTIONAL", "music"],
    ]);
    expect(manifest?.contentItems.slice(0, 3).map((item) => item.label)).toStrictEqual(["Cô dâu & chú rể", "Sự kiện", "Gia đình hai bên"]);
  });

  it("Vietnamese Heritage v1: TEMPLATE_SLOTS, exact content items", () => {
    const manifest = lookupTemplateEditorManifest(VH_KEY);
    expect(manifest?.mediaModel).toBe("TEMPLATE_SLOTS");
    expect(manifest?.contentItems.map((item) => [item.key, item.requirement, item.sectionKey])).toStrictEqual([
      ["COUPLE", "REQUIRED", null],
      ["EVENTS", "REQUIRED", null],
      ["FAMILIES", "RECOMMENDED", null],
      ["LOVE_STORY", "OPTIONAL", "loveStory"],
      ["TIMELINE", "OPTIONAL", "timeline"],
      ["DRESS_CODE", "OPTIONAL", "dressCode"],
      ["GIFT", "OPTIONAL", "gift"],
      ["MUSIC", "OPTIONAL", "music"],
    ]);
  });

  it("Vietnamese Heritage v1: exact media slots", () => {
    const slots = lookupTemplateEditorManifest(VH_KEY)?.mediaSlots.map((slot) => ({
      key: slot.key,
      label: slot.label,
      cardinality: slot.cardinality,
      requirement: slot.requirement,
      minCount: slot.minCount,
      recommendedCount: slot.recommendedCount,
      maxCount: slot.maxCount,
      orientation: slot.orientation,
      aspectRatioHint: slot.aspectRatioHint,
      sectionKey: slot.sectionKey,
    }));
    expect(slots).toStrictEqual([
      { key: "heroPhoto", label: "Ảnh chính", cardinality: "SINGLE", requirement: "RECOMMENDED", minCount: 0, recommendedCount: 1, maxCount: 1, orientation: "PORTRAIT", aspectRatioHint: null, sectionKey: null },
      { key: "portraitCluster", label: "Cụm ảnh ba khung", cardinality: "ORDERED_MULTI", requirement: "RECOMMENDED", minCount: 0, recommendedCount: 3, maxCount: 3, orientation: "PORTRAIT", aspectRatioHint: null, sectionKey: null },
      { key: "loveStoryPhoto", label: "Ảnh chuyện tình yêu", cardinality: "SINGLE", requirement: "OPTIONAL", minCount: 0, recommendedCount: 0, maxCount: 1, orientation: "ANY", aspectRatioHint: null, sectionKey: "loveStory" },
      { key: "gallery", label: "Album ảnh", cardinality: "ORDERED_MULTI", requirement: "OPTIONAL", minCount: 0, recommendedCount: 0, maxCount: null, orientation: "ANY", aspectRatioHint: null, sectionKey: "gallery" },
    ]);
  });

  it("portraitCluster is exactly recommended 3 / max 3 and names positions, not people", () => {
    const cluster = lookupTemplateEditorManifest(VH_KEY)?.mediaSlots.find((slot) => slot.key === "portraitCluster");
    expect(cluster?.recommendedCount).toBe(3);
    expect(cluster?.maxCount).toBe(3);
    expect(cluster?.hint).toContain("1, 2, 3");
  });

  it("no slot key carries groom/couple/bride semantics", () => {
    for (const manifest of PRODUCTION_EDITOR_MANIFESTS) {
      for (const slot of manifest.mediaSlots) expect(slot.key).not.toMatch(/groom|bride|couple/i);
    }
  });

  it("no current renderer has an INVITATION_MESSAGE item (capability false)", () => {
    for (const manifest of PRODUCTION_EDITOR_MANIFESTS) {
      expect(manifest.contentItems.some((item) => item.key === "INVITATION_MESSAGE")).toBe(false);
    }
    for (const renderer of PRODUCTION_RENDERER_MANIFESTS) {
      expect(renderer.compatibility.sectionCapabilities.invitationMessage).toBe(false);
    }
  });

  it("only COUPLE and EVENTS are REQUIRED; no media slot is REQUIRED", () => {
    for (const manifest of PRODUCTION_EDITOR_MANIFESTS) {
      expect(manifest.contentItems.filter((item) => item.requirement === "REQUIRED").map((item) => item.key)).toStrictEqual(["COUPLE", "EVENTS"]);
      for (const slot of manifest.mediaSlots) expect(slot.minCount).toBe(0);
    }
  });

  it("manifests carry no variant-specific field", () => {
    const json = JSON.stringify(PRODUCTION_EDITOR_MANIFESTS);
    expect(json).not.toMatch(/"variant"|"COMMON"|"GROOM"|"BRIDE"/);
  });
});
