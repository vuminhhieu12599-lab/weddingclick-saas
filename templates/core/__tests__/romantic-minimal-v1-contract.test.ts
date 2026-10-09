import { describe, expect, it } from "vitest";

import { validateTemplateEditorManifest } from "../editor-manifest";
import { PRODUCTION_EDITOR_MANIFESTS, lookupTemplateEditorManifest, validateProductionEditorManifests } from "../production-editor-manifests";
import {
  PRODUCTION_COMPATIBILITY_REGISTRY,
  PRODUCTION_RENDERER_KEYS,
  validateProductionRendererManifests,
} from "../production-renderer-manifests";
import { validateRendererProductionManifest } from "../renderer-manifest";
import { ROMANTIC_MINIMAL_V1_EDITOR_MANIFEST } from "../../editor/wedding/romantic-minimal-v1";
import { ROMANTIC_MINIMAL_V1_MANIFEST } from "../../wedding/romantic-minimal/v1/manifest";

/**
 * RM-01 — Romantic Minimal v1 production contract (docs/DECISIONS.md
 * "RM-01"): the renderer and editor manifests validate on their own and
 * against each other, and neither is registered yet (RM-02 registers them
 * together with the renderer binding).
 */

const RM_KEY = "wedding.romantic-minimal.v1";

describe("RM-01 Romantic Minimal v1 renderer manifest", () => {
  it("validates and keeps the exact proposed identity, compatibility and design set", () => {
    const manifest = validateRendererProductionManifest(ROMANTIC_MINIMAL_V1_MANIFEST);
    expect(manifest).toStrictEqual(ROMANTIC_MINIMAL_V1_MANIFEST);
    expect(manifest.identity).toStrictEqual({
      eventType: "WEDDING",
      templateCode: "romantic-minimal",
      versionNumber: 1,
      displayName: "Romantic Minimal",
    });
    expect(manifest.compatibility.rendererKey).toBe(RM_KEY);
    expect(manifest.compatibility.supportedPayloadSchemaVersions).toStrictEqual([1]);
    expect(manifest.compatibility.supportedVariants).toStrictEqual(["COMMON", "GROOM", "BRIDE"]);
    expect(manifest.compatibility.sectionCapabilities).toStrictEqual({
      invitationMessage: false,
      loveStory: true,
      gallery: true,
      music: true,
      gift: true,
      timeline: true,
      dressCode: false,
      photoStory: false,
    });
    expect(manifest.design.palettes).toStrictEqual(["romantic-blush"]);
    expect(manifest.design.fontPresets).toStrictEqual(["romantic-classic"]);
    expect(manifest.design.effectPresets).toStrictEqual(["STANDARD"]);
    expect(Object.keys(manifest.design.sectionSettingsSchema).sort()).toStrictEqual(
      ["gallery", "gift", "loveStory", "music", "timeline"],
    );
    expect(manifest.design.designSettingsSchema).toStrictEqual({});
  });

  it("forms a valid production list with the registered manifests (no duplicate key)", () => {
    const list = validateProductionRendererManifests([
      ...PRODUCTION_RENDERER_KEYS.map((key) => PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(key)),
      ROMANTIC_MINIMAL_V1_MANIFEST,
    ]);
    expect(list.map((manifest) => manifest.compatibility.rendererKey)).toStrictEqual([...PRODUCTION_RENDERER_KEYS, RM_KEY]);
  });

  it("is not registered: the production registry is unchanged and fails closed for the RM key", () => {
    expect(PRODUCTION_RENDERER_KEYS).toStrictEqual(["wedding.elegant-editorial.v1", "wedding.vietnamese-heritage.v1"]);
    expect(PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(RM_KEY)).toBeUndefined();
  });
});

describe("RM-01 Romantic Minimal v1 editor manifest", () => {
  const editor = validateTemplateEditorManifest(ROMANTIC_MINIMAL_V1_EDITOR_MANIFEST);

  it("validates, uses TEMPLATE_SLOTS and names the RM renderer key", () => {
    expect(editor).toStrictEqual(ROMANTIC_MINIMAL_V1_EDITOR_MANIFEST);
    expect(editor.rendererKey).toBe(RM_KEY);
    expect(editor.mediaModel).toBe("TEMPLATE_SLOTS");
  });

  it("lists exactly the capable content items (no INVITATION_MESSAGE, no DRESS_CODE)", () => {
    expect(editor.contentItems.map((item) => [item.key, item.requirement, item.sectionKey])).toStrictEqual([
      ["COUPLE", "REQUIRED", null],
      ["EVENTS", "REQUIRED", null],
      ["FAMILIES", "RECOMMENDED", null],
      ["LOVE_STORY", "OPTIONAL", "loveStory"],
      ["TIMELINE", "OPTIONAL", "timeline"],
      ["GIFT", "OPTIONAL", "gift"],
      ["MUSIC", "OPTIONAL", "music"],
    ]);
  });

  it("declares the five approved photo positions in page order", () => {
    expect(
      editor.mediaSlots.map((slot) => [
        slot.key,
        slot.cardinality,
        slot.requirement,
        slot.minCount,
        slot.recommendedCount,
        slot.maxCount,
        slot.orientation,
        slot.aspectRatioHint,
        slot.sectionKey,
      ]),
    ).toStrictEqual([
      ["saveTheDatePhoto", "SINGLE", "RECOMMENDED", 0, 1, 1, "PORTRAIT", "3:4", null],
      ["justMarriedPhoto", "SINGLE", "RECOMMENDED", 0, 1, 1, "LANDSCAPE", "3:2", null],
      ["ourLovePhotos", "ORDERED_MULTI", "RECOMMENDED", 0, 3, 3, "PORTRAIT", "5:7", "loveStory"],
      ["gallery", "ORDERED_MULTI", "OPTIONAL", 0, 0, null, "ANY", null, "gallery"],
      ["thankYouPhoto", "SINGLE", "RECOMMENDED", 0, 1, 1, "LANDSCAPE", null, null],
    ]);
  });

  it("only the gallery slot is a section's media content (drives sections.gallery)", () => {
    expect(editor.mediaSlots.filter((slot) => slot.sectionKey === "gallery").map((slot) => slot.key)).toStrictEqual(["gallery"]);
  });

  it("cross-validates against the RM renderer manifest's section capabilities", () => {
    const [validated] = validateProductionEditorManifests([ROMANTIC_MINIMAL_V1_EDITOR_MANIFEST], [
      validateRendererProductionManifest(ROMANTIC_MINIMAL_V1_MANIFEST),
    ]);
    expect(validated).toStrictEqual(editor);
  });

  it("is not registered: the production editor list is unchanged and lookup fails closed", () => {
    expect(PRODUCTION_EDITOR_MANIFESTS.map((manifest) => manifest.rendererKey)).toStrictEqual([...PRODUCTION_RENDERER_KEYS]);
    expect(lookupTemplateEditorManifest(RM_KEY)).toBeUndefined();
  });
});
