import { describe, expect, it } from "vitest";

import {
  TEMPLATE_EDITOR_MANIFEST_ERROR_MESSAGES as M,
  TemplateEditorManifestInvariantError,
  validateTemplateEditorManifest,
} from "../editor-manifest";

/** TE-02 — Template Editor Manifest V1 validator (docs/DECISIONS.md "TE-02"). */

type Rec = Record<string, unknown>;

function item(overrides: Rec = {}): Rec {
  return { key: "COUPLE", label: "Cô dâu & chú rể", hint: "Họ tên.", requirement: "REQUIRED", sectionKey: null, ...overrides };
}

function slot(overrides: Rec = {}): Rec {
  return {
    key: "heroPhoto",
    label: "Ảnh chính",
    hint: "Một ảnh.",
    cardinality: "SINGLE",
    requirement: "RECOMMENDED",
    minCount: 0,
    recommendedCount: 1,
    maxCount: 1,
    orientation: "PORTRAIT",
    aspectRatioHint: null,
    sectionKey: null,
    ...overrides,
  };
}

function manifest(overrides: Rec = {}): Rec {
  return {
    schemaVersion: 1,
    rendererKey: "wedding.test.v1",
    mediaModel: "TEMPLATE_SLOTS",
    contentItems: [item(), item({ key: "EVENTS", label: "Sự kiện" })],
    mediaSlots: [slot()],
    ...overrides,
  };
}

function expectFail(value: unknown, message: string): void {
  let caught: unknown;
  try {
    validateTemplateEditorManifest(value);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TemplateEditorManifestInvariantError);
  expect((caught as Error).message).toBe(message);
}

describe("A. top-level shape", () => {
  it("accepts a valid manifest and returns an equal fresh copy", () => {
    const input = manifest();
    const result = validateTemplateEditorManifest(input);
    expect(result).toStrictEqual(input);
    expect(result).not.toBe(input);
    expect(result.contentItems).not.toBe(input.contentItems);
    expect(result.mediaSlots[0]).not.toBe((input.mediaSlots as Rec[])[0]);
  });

  it.each([null, undefined, "x", 1, [], new (class Foo {})(), new Map()])("rejects non-plain-object %p", (value) => {
    expectFail(value, M.MANIFEST_NOT_PLAIN_OBJECT);
  });

  it("accepts a null-prototype manifest object", () => {
    const value = Object.assign(Object.create(null) as Rec, manifest());
    expect(validateTemplateEditorManifest(value).rendererKey).toBe("wedding.test.v1");
  });

  it("requires exactly the five keys", () => {
    const missing = manifest();
    delete missing.mediaSlots;
    expectFail(missing, M.MANIFEST_KEYS);
    expectFail(manifest({ extra: 1 }), M.MANIFEST_KEYS);
  });

  it("rejects symbol, non-enumerable and accessor keys", () => {
    const withSymbol = manifest();
    (withSymbol as Record<symbol, unknown>)[Symbol("x")] = 1;
    expectFail(withSymbol, M.MANIFEST_KEYS);

    const nonEnumerable = manifest();
    Object.defineProperty(nonEnumerable, "hidden", { value: 1, enumerable: false });
    expectFail(nonEnumerable, M.MANIFEST_KEYS);

    const accessor = manifest();
    delete accessor.rendererKey;
    Object.defineProperty(accessor, "rendererKey", { get: () => "wedding.test.v1", enumerable: true });
    expectFail(accessor, M.MANIFEST_KEYS);
  });

  it.each([0, 2, "1", null, 1.5])("rejects schemaVersion %p", (schemaVersion) => {
    expectFail(manifest({ schemaVersion }), M.SCHEMA_VERSION);
  });

  it.each(["", " wedding.test.v1", "wedding.test.v1 ", 1, null])("rejects rendererKey %p (no normalization)", (rendererKey) => {
    expectFail(manifest({ rendererKey }), M.RENDERER_KEY);
  });

  it.each(["legacy_roles", "SLOTS", "", null])("rejects mediaModel %p", (mediaModel) => {
    expectFail(manifest({ mediaModel }), M.MEDIA_MODEL);
  });

  it("requires contentItems and mediaSlots to be exact data arrays", () => {
    expectFail(manifest({ contentItems: {} }), M.CONTENT_ITEMS_NOT_ARRAY);
    expectFail(manifest({ mediaSlots: "x" }), M.MEDIA_SLOTS_NOT_ARRAY);
    const extraProp = [item()] as unknown as Rec;
    extraProp.extra = 1;
    expectFail(manifest({ contentItems: extraProp }), M.CONTENT_ITEMS_NOT_ARRAY);
    expectFail(manifest({ mediaSlots: [slot(), , slot({ key: "other" })] }), M.MEDIA_SLOTS_NOT_ARRAY);
    const getterArray = [slot()];
    Object.defineProperty(getterArray, 0, { get: () => slot(), enumerable: true });
    expectFail(manifest({ mediaSlots: getterArray }), M.MEDIA_SLOTS_NOT_ARRAY);
  });

  it("returns a deeply frozen result that later input mutation cannot change", () => {
    const input = manifest();
    const result = validateTemplateEditorManifest(input);
    (input.contentItems as Rec[])[0]!.label = "changed";
    (input.mediaSlots as Rec[])[0]!.maxCount = 99;
    input.rendererKey = "changed";
    expect(result.rendererKey).toBe("wedding.test.v1");
    expect(result.contentItems[0]?.label).toBe("Cô dâu & chú rể");
    expect(result.mediaSlots[0]?.maxCount).toBe(1);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.contentItems)).toBe(true);
    expect(Object.isFrozen(result.contentItems[0])).toBe(true);
    expect(Object.isFrozen(result.mediaSlots)).toBe(true);
    expect(Object.isFrozen(result.mediaSlots[0])).toBe(true);
  });
});

describe("B. content items", () => {
  const withItems = (...items: Rec[]) => manifest({ contentItems: items });

  it("rejects non-object items and wrong key sets", () => {
    expectFail(withItems("COUPLE" as unknown as Rec), M.CONTENT_ITEM_NOT_PLAIN_OBJECT);
    expectFail(withItems({ ...item(), extra: 1 }), M.CONTENT_ITEM_KEYS);
    const missing = item();
    delete missing.sectionKey;
    expectFail(withItems(missing), M.CONTENT_ITEM_KEYS);
  });

  it.each(["couple", "GALLERY", "PHOTO_STORY", "", null])("rejects unknown content key %p", (key) => {
    expectFail(withItems(item({ key })), M.CONTENT_ITEM_KEY);
  });

  it("rejects duplicate content keys", () => {
    expectFail(withItems(item(), item()), M.CONTENT_ITEM_DUPLICATE);
  });

  it.each(["", " x", "x ", 1])("rejects label/hint %p", (value) => {
    expectFail(withItems(item({ label: value })), M.CONTENT_ITEM_LABEL);
    expectFail(withItems(item({ hint: value })), M.CONTENT_ITEM_HINT);
  });

  it.each(["required", "BLOCKING", null])("rejects requirement %p", (requirement) => {
    expectFail(withItems(item({ requirement })), M.CONTENT_ITEM_REQUIREMENT);
  });

  it("allows REQUIRED only for COUPLE and EVENTS", () => {
    expect(() => validateTemplateEditorManifest(withItems(item(), item({ key: "EVENTS" })))).not.toThrow();
    expectFail(withItems(item({ key: "FAMILIES", requirement: "REQUIRED" })), M.CONTENT_ITEM_REQUIRED_NOT_ALLOWED);
    expectFail(
      withItems(item({ key: "GIFT", requirement: "REQUIRED", sectionKey: "gift" })),
      M.CONTENT_ITEM_REQUIRED_NOT_ALLOWED,
    );
  });

  it("requires the one fixed sectionKey per content key", () => {
    expectFail(withItems(item({ sectionKey: "gift" })), M.CONTENT_ITEM_SECTION_KEY);
    expectFail(withItems(item({ key: "LOVE_STORY", requirement: "OPTIONAL", sectionKey: null })), M.CONTENT_ITEM_SECTION_KEY);
    expectFail(withItems(item({ key: "LOVE_STORY", requirement: "OPTIONAL", sectionKey: "gallery" })), M.CONTENT_ITEM_SECTION_KEY);
    expectFail(withItems(item({ key: "MUSIC", requirement: "OPTIONAL", sectionKey: "unknownSection" })), M.CONTENT_ITEM_SECTION_KEY);
    const ok = validateTemplateEditorManifest(
      withItems(
        item({ key: "INVITATION_MESSAGE", requirement: "OPTIONAL", sectionKey: "invitationMessage" }),
        item({ key: "TIMELINE", requirement: "RECOMMENDED", sectionKey: "timeline" }),
        item({ key: "DRESS_CODE", requirement: "OPTIONAL", sectionKey: "dressCode" }),
      ),
    );
    expect(ok.contentItems.map((entry) => entry.sectionKey)).toStrictEqual(["invitationMessage", "timeline", "dressCode"]);
  });

  it("preserves content order", () => {
    const result = validateTemplateEditorManifest(withItems(item({ key: "EVENTS" }), item()));
    expect(result.contentItems.map((entry) => entry.key)).toStrictEqual(["EVENTS", "COUPLE"]);
  });
});

describe("C. media slots", () => {
  const withSlots = (...slots: Rec[]) => manifest({ mediaSlots: slots });

  it("rejects non-object slots and wrong key sets", () => {
    expectFail(withSlots(1 as unknown as Rec), M.MEDIA_SLOT_NOT_PLAIN_OBJECT);
    expectFail(withSlots({ ...slot(), extra: 1 }), M.MEDIA_SLOT_KEYS);
    const missing = slot();
    delete missing.aspectRatioHint;
    expectFail(withSlots(missing), M.MEDIA_SLOT_KEYS);
  });

  it.each(["HeroPhoto", "hero_photo", "hero-photo", "1hero", "", " heroPhoto", "a".repeat(49), 1])("rejects slot key %p", (key) => {
    expectFail(withSlots(slot({ key })), M.MEDIA_SLOT_KEY);
  });

  it.each(["groomPortrait", "couplePhoto", "portraitBride", "brideAndGroom"])("rejects person/side slot key %p", (key) => {
    expectFail(withSlots(slot({ key })), M.MEDIA_SLOT_KEY_SEMANTIC);
  });

  it("accepts lower camelCase keys up to 48 characters", () => {
    expect(() => validateTemplateEditorManifest(withSlots(slot({ key: "a" })))).not.toThrow();
    expect(() => validateTemplateEditorManifest(withSlots(slot({ key: `a${"B".repeat(47)}` })))).not.toThrow();
  });

  it("rejects duplicate slot keys", () => {
    expectFail(withSlots(slot(), slot()), M.MEDIA_SLOT_DUPLICATE);
  });

  it.each(["", " x", 1])("rejects label/hint %p", (value) => {
    expectFail(withSlots(slot({ label: value })), M.MEDIA_SLOT_LABEL);
    expectFail(withSlots(slot({ hint: value })), M.MEDIA_SLOT_HINT);
  });

  it.each(["MULTI", "single", null])("rejects cardinality %p", (cardinality) => {
    expectFail(withSlots(slot({ cardinality })), M.MEDIA_SLOT_CARDINALITY);
  });

  it.each(["REQUIRED", "recommended", null])("rejects slot requirement %p (no REQUIRED slot in V1)", (requirement) => {
    expectFail(withSlots(slot({ requirement })), M.MEDIA_SLOT_REQUIREMENT);
  });

  it.each([1, -1, "0", null])("rejects minCount %p", (minCount) => {
    expectFail(withSlots(slot({ minCount })), M.MEDIA_SLOT_MIN_COUNT);
  });

  it.each([-1, 0.5, "1", null, Number.MAX_SAFE_INTEGER + 1])("rejects recommendedCount %p", (recommendedCount) => {
    expectFail(withSlots(slot({ cardinality: "ORDERED_MULTI", maxCount: null, recommendedCount })), M.MEDIA_SLOT_RECOMMENDED_COUNT);
  });

  it.each([0, -1, 1.5, "3", Number.POSITIVE_INFINITY])("rejects maxCount %p", (maxCount) => {
    expectFail(withSlots(slot({ cardinality: "ORDERED_MULTI", recommendedCount: 0, maxCount })), M.MEDIA_SLOT_MAX_COUNT);
  });

  it("rejects recommendedCount above a finite maxCount", () => {
    expectFail(withSlots(slot({ cardinality: "ORDERED_MULTI", recommendedCount: 4, maxCount: 3 })), M.MEDIA_SLOT_RECOMMENDED_ABOVE_MAX);
    expectFail(withSlots(slot({ recommendedCount: 2 })), M.MEDIA_SLOT_RECOMMENDED_ABOVE_MAX);
  });

  it("requires SINGLE slots to have maxCount 1 and allows recommendedCount 0 or 1", () => {
    expectFail(withSlots(slot({ maxCount: 2 })), M.MEDIA_SLOT_SINGLE_MAX);
    expectFail(withSlots(slot({ maxCount: null })), M.MEDIA_SLOT_SINGLE_MAX);
    expect(() => validateTemplateEditorManifest(withSlots(slot({ recommendedCount: 0 })))).not.toThrow();
    expect(() => validateTemplateEditorManifest(withSlots(slot({ recommendedCount: 1 })))).not.toThrow();
  });

  it("allows ORDERED_MULTI with a finite or unbounded maxCount", () => {
    const finite = slot({ key: "cluster", cardinality: "ORDERED_MULTI", recommendedCount: 3, maxCount: 3 });
    const unbounded = slot({ key: "album", cardinality: "ORDERED_MULTI", recommendedCount: 12, maxCount: null });
    const result = validateTemplateEditorManifest(withSlots(finite, unbounded));
    expect(result.mediaSlots.map((entry) => entry.maxCount)).toStrictEqual([3, null]);
  });

  it.each(["portrait", "VERTICAL", null])("rejects orientation %p", (orientation) => {
    expectFail(withSlots(slot({ orientation })), M.MEDIA_SLOT_ORIENTATION);
  });

  it.each(["4/5", "4:5 ", " 4:5", "0:5", "04:5", "4:0", "4:5:6", "1.5:1", "", 1.25])("rejects aspectRatioHint %p", (aspectRatioHint) => {
    expectFail(withSlots(slot({ aspectRatioHint })), M.MEDIA_SLOT_ASPECT_RATIO_HINT);
  });

  it.each(["4:5", "3:2", "1:1", "16:9"])("accepts aspectRatioHint %p", (aspectRatioHint) => {
    expect(validateTemplateEditorManifest(withSlots(slot({ aspectRatioHint }))).mediaSlots[0]?.aspectRatioHint).toBe(aspectRatioHint);
  });

  it.each(["albums", "Gallery", "", 1])("rejects slot sectionKey %p", (sectionKey) => {
    expectFail(withSlots(slot({ sectionKey })), M.MEDIA_SLOT_SECTION_KEY);
  });

  it("accepts a null or canonical renderer sectionKey and keeps slot order", () => {
    const result = validateTemplateEditorManifest(
      withSlots(slot({ key: "b", sectionKey: "gallery", cardinality: "ORDERED_MULTI", maxCount: null }), slot({ key: "a" })),
    );
    expect(result.mediaSlots.map((entry) => [entry.key, entry.sectionKey])).toStrictEqual([
      ["b", "gallery"],
      ["a", null],
    ]);
  });
});

describe("D. mediaModel", () => {
  it("LEGACY_ROLES requires zero slots", () => {
    expect(validateTemplateEditorManifest(manifest({ mediaModel: "LEGACY_ROLES", mediaSlots: [] })).mediaSlots).toStrictEqual([]);
    expectFail(manifest({ mediaModel: "LEGACY_ROLES" }), M.LEGACY_ROLES_WITH_SLOTS);
  });

  it("TEMPLATE_SLOTS requires at least one slot", () => {
    expectFail(manifest({ mediaModel: "TEMPLATE_SLOTS", mediaSlots: [] }), M.TEMPLATE_SLOTS_WITHOUT_SLOTS);
  });
});

describe("fixed error messages", () => {
  it("never echo manifest content", () => {
    const secret = "SECRET-VALUE";
    for (const value of [manifest({ rendererKey: ` ${secret}` }), manifest({ mediaSlots: [slot({ key: secret })] })]) {
      try {
        validateTemplateEditorManifest(value);
      } catch (error) {
        expect((error as Error).message).not.toContain(secret);
      }
    }
    for (const message of Object.values(M)) expect(message).not.toMatch(/\$\{/);
  });
});
