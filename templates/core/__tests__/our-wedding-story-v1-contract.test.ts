import { describe, expect, it } from "vitest";

import { validateTemplateEditorManifest } from "../editor-manifest";
import { PRODUCTION_EDITOR_MANIFESTS, lookupTemplateEditorManifest, validateProductionEditorManifests } from "../production-editor-manifests";
import { PRODUCTION_COMPATIBILITY_REGISTRY, PRODUCTION_RENDERER_KEYS } from "../production-renderer-manifests";
import { validateRendererProductionManifest } from "../renderer-manifest";
import { OUR_WEDDING_STORY_V1_EDITOR_MANIFEST } from "../../editor/wedding/our-wedding-story-v1";
import { OUR_WEDDING_STORY_V1_MANIFEST } from "../../wedding/our-wedding-story/v1/manifest";

/**
 * OWS-01 — Our Wedding Story v1 production contract (docs/DECISIONS.md
 * "OWS-01"): the renderer and editor manifests validate on their own and
 * against each other, are registered fourth (key lookups exact, fail closed),
 * and the editor manifest uses the person-bound portrait exception exactly
 * once per person.
 */

const OWS_KEY = "wedding.our-wedding-story.v1";

describe("OWS-01 Our Wedding Story v1 renderer manifest", () => {
  it("validates and keeps the exact identity, compatibility and design set", () => {
    const manifest = validateRendererProductionManifest(OUR_WEDDING_STORY_V1_MANIFEST);
    expect(manifest).toStrictEqual(OUR_WEDDING_STORY_V1_MANIFEST);
    expect(manifest.identity).toStrictEqual({
      eventType: "WEDDING",
      templateCode: "our-wedding-story",
      versionNumber: 1,
      displayName: "Our Wedding Story",
    });
    expect(manifest.compatibility.rendererKey).toBe(OWS_KEY);
    expect(manifest.compatibility.supportedPayloadSchemaVersions).toStrictEqual([1]);
    expect(manifest.compatibility.supportedVariants).toStrictEqual(["COMMON", "GROOM", "BRIDE"]);
    expect(manifest.compatibility.sectionCapabilities).toStrictEqual({
      invitationMessage: false,
      loveStory: true,
      gallery: true,
      music: true,
      gift: true,
      timeline: false,
      dressCode: false,
      photoStory: false,
    });
    expect(manifest.design.palettes).toStrictEqual(["warm-champagne"]);
    expect(manifest.design.fontPresets).toStrictEqual(["champagne-editorial"]);
    expect(manifest.design.effectPresets).toStrictEqual(["STANDARD"]);
    expect(Object.keys(manifest.design.sectionSettingsSchema).sort()).toStrictEqual(["gallery", "gift", "loveStory", "music"]);
    expect(manifest.design.designSettingsSchema).toStrictEqual({});
  });

  it("registered fourth, as the validated projection; near-miss keys still fail closed", () => {
    expect(PRODUCTION_RENDERER_KEYS).toStrictEqual([
      "wedding.elegant-editorial.v1",
      "wedding.vietnamese-heritage.v1",
      "wedding.romantic-minimal.v1",
      OWS_KEY,
    ]);
    expect(PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(OWS_KEY)).toStrictEqual(OUR_WEDDING_STORY_V1_MANIFEST);
    expect(PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(OWS_KEY)).not.toBe(OUR_WEDDING_STORY_V1_MANIFEST);
    for (const key of ["wedding.our-wedding-story", "wedding.our-wedding-story.v2", ` ${OWS_KEY}`, OWS_KEY.toUpperCase()]) {
      expect(PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(key), key).toBeUndefined();
    }
  });
});

describe("OWS-01 Our Wedding Story v1 editor manifest", () => {
  const editor = validateTemplateEditorManifest(OUR_WEDDING_STORY_V1_EDITOR_MANIFEST);

  it("validates, uses TEMPLATE_SLOTS and names the OWS renderer key", () => {
    expect(editor).toStrictEqual(OUR_WEDDING_STORY_V1_EDITOR_MANIFEST);
    expect(editor.rendererKey).toBe(OWS_KEY);
    expect(editor.mediaModel).toBe("TEMPLATE_SLOTS");
  });

  it("lists exactly the capable content items (no INVITATION_MESSAGE, TIMELINE or DRESS_CODE)", () => {
    expect(editor.contentItems.map((item) => [item.key, item.requirement, item.sectionKey])).toStrictEqual([
      ["COUPLE", "REQUIRED", null],
      ["EVENTS", "REQUIRED", null],
      ["FAMILIES", "RECOMMENDED", null],
      ["LOVE_STORY", "OPTIONAL", "loveStory"],
      ["GIFT", "OPTIONAL", "gift"],
      ["MUSIC", "OPTIONAL", "music"],
    ]);
  });

  it("declares the six approved photo slots in page order", () => {
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
      ["coverPhoto", "SINGLE", "RECOMMENDED", 0, 1, 1, "PORTRAIT", "3:4", null],
      ["groomPortrait", "SINGLE", "OPTIONAL", 0, 0, 1, "PORTRAIT", "3:4", null],
      ["bridePortrait", "SINGLE", "OPTIONAL", 0, 0, 1, "PORTRAIT", "3:4", null],
      ["storyPhoto", "SINGLE", "OPTIONAL", 0, 0, 1, "LANDSCAPE", "4:3", "loveStory"],
      ["gallery", "ORDERED_MULTI", "OPTIONAL", 0, 0, null, "ANY", null, "gallery"],
      ["thankYouPhoto", "SINGLE", "RECOMMENDED", 0, 1, 1, "PORTRAIT", "4:5", null],
    ]);
  });

  it("only the two OWS-01 portrait slots are person-bound; every other slot is a position", () => {
    expect(editor.mediaSlots.filter((slot) => /groom|bride|couple/i.test(slot.key)).map((slot) => slot.key)).toStrictEqual([
      "groomPortrait",
      "bridePortrait",
    ]);
  });

  it("only the gallery slot is a section's media content (drives sections.gallery)", () => {
    expect(editor.mediaSlots.filter((slot) => slot.sectionKey === "gallery").map((slot) => slot.key)).toStrictEqual(["gallery"]);
  });

  it("cross-validates against the OWS renderer manifest's section capabilities", () => {
    const [validated] = validateProductionEditorManifests([OUR_WEDDING_STORY_V1_EDITOR_MANIFEST], [
      validateRendererProductionManifest(OUR_WEDDING_STORY_V1_MANIFEST),
    ]);
    expect(validated).toStrictEqual(editor);
  });

  it("registered fourth in the production editor list; lookup is exact and fails closed otherwise", () => {
    expect(PRODUCTION_EDITOR_MANIFESTS.map((manifest) => manifest.rendererKey)).toStrictEqual([...PRODUCTION_RENDERER_KEYS]);
    expect(lookupTemplateEditorManifest(OWS_KEY)).toStrictEqual(editor);
    for (const key of ["wedding.our-wedding-story", "wedding.our-wedding-story.v2", `${OWS_KEY} `]) {
      expect(lookupTemplateEditorManifest(key), key).toBeUndefined();
    }
  });
});
