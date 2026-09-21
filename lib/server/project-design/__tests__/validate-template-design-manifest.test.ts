import { describe, expect, it } from "vitest";

import { validateTemplateDesignManifest } from "../validate-template-design-manifest";

const MINIMAL_VALID_MANIFEST = {
  schemaVersion: 1,
  palettes: ["ivory-champagne", "blush-floral"],
  fontPresets: ["editorial-classic"],
  effectPresets: ["NONE", "LIGHT"],
  sectionSettingsSchema: {
    showGallery: { type: "boolean" },
  },
  designSettingsSchema: {
    heroHeadline: { type: "string" },
  },
};

describe("validateTemplateDesignManifest", () => {
  it("accepts a valid minimal design manifest", () => {
    const result = validateTemplateDesignManifest(MINIMAL_VALID_MANIFEST);

    expect(result).toEqual({
      schemaVersion: 1,
      palettes: ["ivory-champagne", "blush-floral"],
      fontPresets: ["editorial-classic"],
      effectPresets: ["NONE", "LIGHT"],
      sectionSettingsSchema: { showGallery: { type: "boolean" } },
      designSettingsSchema: { heroHeadline: { type: "string" } },
    });
  });

  it("ignores extra raw renderer metadata unrelated to the six required fields", () => {
    const result = validateTemplateDesignManifest({
      ...MINIMAL_VALID_MANIFEST,
      code: "elegant-editorial",
      rendererKey: "wedding.elegant-editorial.v1",
      supportedFeatures: ["countdown", "gallery"],
      previewMetadata: { thumbnailUrl: "https://example.com/thumb.png" },
    });

    expect(result).toEqual({
      schemaVersion: 1,
      palettes: ["ivory-champagne", "blush-floral"],
      fontPresets: ["editorial-classic"],
      effectPresets: ["NONE", "LIGHT"],
      sectionSettingsSchema: { showGallery: { type: "boolean" } },
      designSettingsSchema: { heroHeadline: { type: "string" } },
    });
    expect(result).not.toHaveProperty("code");
    expect(result).not.toHaveProperty("rendererKey");
    expect(result).not.toHaveProperty("supportedFeatures");
    expect(result).not.toHaveProperty("previewMetadata");
  });

  it.each(["not an object", null, [], 42])("rejects raw manifest %j", (raw) => {
    expect(() => validateTemplateDesignManifest(raw)).toThrow();
  });

  it("rejects a wrong schemaVersion", () => {
    expect(() =>
      validateTemplateDesignManifest({ ...MINIMAL_VALID_MANIFEST, schemaVersion: 2 }),
    ).toThrow();
    expect(() =>
      validateTemplateDesignManifest({ ...MINIMAL_VALID_MANIFEST, schemaVersion: "1" }),
    ).toThrow();
    expect(() =>
      validateTemplateDesignManifest({ ...MINIMAL_VALID_MANIFEST, schemaVersion: undefined }),
    ).toThrow();
  });

  it("rejects palettes of the wrong type", () => {
    expect(() =>
      validateTemplateDesignManifest({ ...MINIMAL_VALID_MANIFEST, palettes: "ivory-champagne" }),
    ).toThrow();
    expect(() =>
      validateTemplateDesignManifest({ ...MINIMAL_VALID_MANIFEST, palettes: {} }),
    ).toThrow();
  });

  it("rejects a non-string preset entry", () => {
    expect(() =>
      validateTemplateDesignManifest({ ...MINIMAL_VALID_MANIFEST, palettes: ["valid", 123] }),
    ).toThrow();
  });

  it("rejects an empty-after-trim manifest preset entry", () => {
    expect(() =>
      validateTemplateDesignManifest({ ...MINIMAL_VALID_MANIFEST, fontPresets: ["   "] }),
    ).toThrow();
  });

  it("rejects a duplicate preset entry after trim-normalization", () => {
    expect(() =>
      validateTemplateDesignManifest({
        ...MINIMAL_VALID_MANIFEST,
        palettes: ["ivory-champagne", " ivory-champagne "],
      }),
    ).toThrow();
  });

  it("trims preset entries in the returned manifest", () => {
    const result = validateTemplateDesignManifest({
      ...MINIMAL_VALID_MANIFEST,
      effectPresets: ["  NONE  ", "LIGHT"],
    });

    expect(result.effectPresets).toEqual(["NONE", "LIGHT"]);
  });

  describe("ManifestSettingSpec", () => {
    it("accepts a valid string setting spec", () => {
      const result = validateTemplateDesignManifest({
        ...MINIMAL_VALID_MANIFEST,
        designSettingsSchema: {
          heroHeadline: { type: "string", enumValues: ["A", "B"] },
        },
      });

      expect(result.designSettingsSchema.heroHeadline).toEqual({
        type: "string",
        enumValues: ["A", "B"],
      });
    });

    it("accepts a valid number setting spec", () => {
      const result = validateTemplateDesignManifest({
        ...MINIMAL_VALID_MANIFEST,
        designSettingsSchema: {
          galleryColumns: { type: "number", enumValues: [2, 3, 4] },
        },
      });

      expect(result.designSettingsSchema.galleryColumns).toEqual({
        type: "number",
        enumValues: [2, 3, 4],
      });
    });

    it("accepts a valid boolean setting spec", () => {
      const result = validateTemplateDesignManifest({
        ...MINIMAL_VALID_MANIFEST,
        designSettingsSchema: {
          showMusic: { type: "boolean" },
        },
      });

      expect(result.designSettingsSchema.showMusic).toEqual({ type: "boolean" });
    });

    it("accepts a boolean enum specifically ([true, false])", () => {
      const result = validateTemplateDesignManifest({
        ...MINIMAL_VALID_MANIFEST,
        designSettingsSchema: {
          showMusic: { type: "boolean", enumValues: [true, false] },
        },
      });

      expect(result.designSettingsSchema.showMusic).toEqual({
        type: "boolean",
        enumValues: [true, false],
      });
    });

    it("rejects a spec whose enumValues primitive type does not match its own type (boolean spec, string enum)", () => {
      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          designSettingsSchema: {
            showMusic: { type: "boolean", enumValues: ["true"] },
          },
        }),
      ).toThrow();
    });

    it("rejects a numeric manifest enum containing NaN", () => {
      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          designSettingsSchema: {
            galleryColumns: { type: "number", enumValues: [1, Number.NaN] },
          },
        }),
      ).toThrow();
    });

    it("rejects a numeric manifest enum containing Infinity", () => {
      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          designSettingsSchema: {
            galleryColumns: { type: "number", enumValues: [1, Number.POSITIVE_INFINITY] },
          },
        }),
      ).toThrow();
    });

    it("rejects a duplicate enum entry after normalization", () => {
      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          designSettingsSchema: {
            heroHeadline: { type: "string", enumValues: ["A", " A "] },
          },
        }),
      ).toThrow();
    });

    it("rejects a malformed schema entry (unknown type literal)", () => {
      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          designSettingsSchema: {
            heroHeadline: { type: "object" },
          },
        }),
      ).toThrow();
    });

    it("rejects a schema entry that is not an object", () => {
      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          designSettingsSchema: { heroHeadline: "string" },
        }),
      ).toThrow();
    });

    it("rejects an unknown own key on a ManifestSettingSpec (not a Task-029 extension point)", () => {
      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          designSettingsSchema: {
            heroHeadline: { type: "string", rendererComponent: "Something" },
          },
        }),
      ).toThrow();
    });

    it("rejects a typo'd enumValue (singular) instead of enumValues", () => {
      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          designSettingsSchema: {
            heroHeadline: { type: "string", enumValue: ["A"] },
          },
        }),
      ).toThrow();
    });

    it("does not accept an inherited `type` — only an own `type` counts", () => {
      const proto = { type: "string" };
      const spec = Object.create(proto) as Record<string, unknown>;
      // `type` is inherited via the prototype, not an own property.

      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          designSettingsSchema: { heroHeadline: spec },
        }),
      ).toThrow();
    });

    it("does not consume an inherited `enumValues` — only own `enumValues` is read", () => {
      const proto = { enumValues: ["A", "B"] };
      const spec = Object.create(proto) as Record<string, unknown>;
      spec.type = "string";
      // `enumValues` is inherited via the prototype, not an own property —
      // this is a structurally valid spec (enumValues is optional), but the
      // inherited enum must never be read.

      const result = validateTemplateDesignManifest({
        ...MINIMAL_VALID_MANIFEST,
        designSettingsSchema: { heroHeadline: spec },
      });

      expect(result.designSettingsSchema.heroHeadline).toEqual({ type: "string" });
    });
  });

  describe("normalized schema-key collision (Finding 3A)", () => {
    it("rejects sectionSettingsSchema keys that collide after trim-normalization", () => {
      const raw = { hero: { type: "boolean" }, " hero ": { type: "string" } };

      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          sectionSettingsSchema: raw,
        }),
      ).toThrow();
    });

    it("rejects designSettingsSchema keys that collide after trim-normalization", () => {
      const raw = { heroHeadline: { type: "string" }, " heroHeadline ": { type: "number" } };

      expect(() =>
        validateTemplateDesignManifest({
          ...MINIMAL_VALID_MANIFEST,
          designSettingsSchema: raw,
        }),
      ).toThrow();
    });
  });

  describe("required top-level fields must be own properties", () => {
    it("rejects a manifest whose schemaVersion is only inherited, not own", () => {
      const proto = { schemaVersion: 1 };
      const raw = Object.create(proto) as Record<string, unknown>;
      raw.palettes = MINIMAL_VALID_MANIFEST.palettes;
      raw.fontPresets = MINIMAL_VALID_MANIFEST.fontPresets;
      raw.effectPresets = MINIMAL_VALID_MANIFEST.effectPresets;
      raw.sectionSettingsSchema = MINIMAL_VALID_MANIFEST.sectionSettingsSchema;
      raw.designSettingsSchema = MINIMAL_VALID_MANIFEST.designSettingsSchema;

      expect(() => validateTemplateDesignManifest(raw)).toThrow();
    });

    it("rejects a manifest whose sectionSettingsSchema is only inherited, not own", () => {
      const proto = { sectionSettingsSchema: {} };
      const raw = Object.create(proto) as Record<string, unknown>;
      raw.schemaVersion = 1;
      raw.palettes = MINIMAL_VALID_MANIFEST.palettes;
      raw.fontPresets = MINIMAL_VALID_MANIFEST.fontPresets;
      raw.effectPresets = MINIMAL_VALID_MANIFEST.effectPresets;
      raw.designSettingsSchema = MINIMAL_VALID_MANIFEST.designSettingsSchema;

      expect(() => validateTemplateDesignManifest(raw)).toThrow();
    });
  });

  describe("prototype safety", () => {
    it("does not traverse inherited properties of sectionSettingsSchema/designSettingsSchema", () => {
      const inherited = { showGallery: { type: "boolean" } };
      const proto = Object.create(inherited) as Record<string, unknown>;
      proto.ownKey = { type: "string" };

      const result = validateTemplateDesignManifest({
        ...MINIMAL_VALID_MANIFEST,
        sectionSettingsSchema: proto,
      });

      expect(Object.keys(result.sectionSettingsSchema)).toEqual(["ownKey"]);
      expect(result.sectionSettingsSchema.showGallery).toBeUndefined();
    });

    it("safely handles a schema key literally named __proto__ without polluting Object.prototype", () => {
      const raw = JSON.parse(
        `{"__proto__": {"type": "string"}, "safeKey": {"type": "boolean"}}`,
      ) as Record<string, unknown>;

      const result = validateTemplateDesignManifest({
        ...MINIMAL_VALID_MANIFEST,
        sectionSettingsSchema: raw,
      });

      expect(result.sectionSettingsSchema.safeKey).toEqual({ type: "boolean" });
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("safely handles constructor/prototype-named schema keys", () => {
      const raw = { constructor: { type: "string" }, prototype: { type: "number" } };

      const result = validateTemplateDesignManifest({
        ...MINIMAL_VALID_MANIFEST,
        sectionSettingsSchema: raw,
      });

      expect(result.sectionSettingsSchema.constructor).toEqual({ type: "string" });
      expect(result.sectionSettingsSchema.prototype).toEqual({ type: "number" });
    });
  });
});
