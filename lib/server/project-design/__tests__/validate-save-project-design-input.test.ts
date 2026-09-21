import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { validateSaveProjectDesignInput } from "../validate-save-project-design-input";

const VALID_UUID = "22222222-2222-2222-2222-222222222222";

const VALID_BODY = {
  templateVersionId: VALID_UUID,
  paletteKey: "ivory-champagne",
  fontPresetKey: "editorial-classic",
  effectPresetKey: "NONE",
  sectionSettings: { showGallery: true },
  designSettings: { heroHeadline: "Chúng tôi sắp cưới" },
};

describe("validateSaveProjectDesignInput", () => {
  it("accepts exactly the six documented fields", () => {
    const result = validateSaveProjectDesignInput(VALID_BODY);

    expect(result).toEqual({
      templateVersionId: VALID_UUID,
      paletteKey: "ivory-champagne",
      fontPresetKey: "editorial-classic",
      effectPresetKey: "NONE",
      sectionSettings: { showGallery: true },
      designSettings: { heroHeadline: "Chúng tôi sắp cưới" },
    });
  });

  it.each(Object.keys(VALID_BODY))("rejects a body missing required field %s", (missingField) => {
    const body = { ...VALID_BODY } as Record<string, unknown>;
    delete body[missingField];

    expect(() => validateSaveProjectDesignInput(body)).toThrow(ApiError);
  });

  it.each([
    "id",
    "projectId",
    "project_id",
    "createdAt",
    "updatedAt",
    "templateId",
    "templateCode",
    "rendererKey",
    "manifest",
    "designManifest",
    "isActive",
    "retiredAt",
    "selectable",
    "somethingUnknown",
  ])("rejects an unknown/forbidden top-level field %s", (field) => {
    const body = { ...VALID_BODY, [field]: "attacker-supplied" };

    expect(() => validateSaveProjectDesignInput(body)).toThrow(ApiError);
  });

  it("rejects a non-object body", () => {
    expect(() => validateSaveProjectDesignInput("not an object")).toThrow(ApiError);
    expect(() => validateSaveProjectDesignInput(null)).toThrow(ApiError);
    expect(() => validateSaveProjectDesignInput([])).toThrow(ApiError);
  });

  describe("templateVersionId", () => {
    it("rejects a malformed UUID", () => {
      expect(() =>
        validateSaveProjectDesignInput({ ...VALID_BODY, templateVersionId: "not-a-uuid" }),
      ).toThrow(ApiError);
    });

    it("rejects a non-string value", () => {
      expect(() =>
        validateSaveProjectDesignInput({ ...VALID_BODY, templateVersionId: 123 }),
      ).toThrow(ApiError);
    });
  });

  describe("preset keys", () => {
    it("trims leading/trailing whitespace", () => {
      const result = validateSaveProjectDesignInput({
        ...VALID_BODY,
        paletteKey: "  ivory-champagne  ",
      });

      expect(result.paletteKey).toBe("ivory-champagne");
    });

    it("rejects an empty-after-trim preset key", () => {
      expect(() =>
        validateSaveProjectDesignInput({ ...VALID_BODY, fontPresetKey: "   " }),
      ).toThrow(ApiError);
    });

    it("rejects a preset key exceeding MAX_FIELD_LENGTH", () => {
      expect(() =>
        validateSaveProjectDesignInput({
          ...VALID_BODY,
          effectPresetKey: "a".repeat(20001),
        }),
      ).toThrow(ApiError);
    });

    it("accepts a preset key at exactly MAX_FIELD_LENGTH", () => {
      const result = validateSaveProjectDesignInput({
        ...VALID_BODY,
        effectPresetKey: "a".repeat(20000),
      });

      expect(result.effectPresetKey).toBe("a".repeat(20000));
    });

    it("rejects a non-string preset key", () => {
      expect(() => validateSaveProjectDesignInput({ ...VALID_BODY, paletteKey: 42 })).toThrow(
        ApiError,
      );
    });
  });

  describe("sectionSettings / designSettings", () => {
    it("requires a plain object", () => {
      expect(() =>
        validateSaveProjectDesignInput({ ...VALID_BODY, sectionSettings: [] }),
      ).toThrow(ApiError);
      expect(() =>
        validateSaveProjectDesignInput({ ...VALID_BODY, sectionSettings: "not an object" }),
      ).toThrow(ApiError);
      expect(() =>
        validateSaveProjectDesignInput({ ...VALID_BODY, designSettings: null }),
      ).toThrow(ApiError);
    });

    it("rejects a nested object value", () => {
      expect(() =>
        validateSaveProjectDesignInput({
          ...VALID_BODY,
          sectionSettings: { showGallery: { nested: true } },
        }),
      ).toThrow(ApiError);
    });

    it("rejects a nested array value", () => {
      expect(() =>
        validateSaveProjectDesignInput({
          ...VALID_BODY,
          designSettings: { tags: ["a", "b"] },
        }),
      ).toThrow(ApiError);
    });

    it("accepts a finite number value", () => {
      const result = validateSaveProjectDesignInput({
        ...VALID_BODY,
        designSettings: { galleryColumns: 3 },
      });

      expect(result.designSettings.galleryColumns).toBe(3);
    });

    it("rejects NaN", () => {
      expect(() =>
        validateSaveProjectDesignInput({
          ...VALID_BODY,
          designSettings: { galleryColumns: Number.NaN },
        }),
      ).toThrow(ApiError);
    });

    it("rejects Infinity", () => {
      expect(() =>
        validateSaveProjectDesignInput({
          ...VALID_BODY,
          designSettings: { galleryColumns: Number.POSITIVE_INFINITY },
        }),
      ).toThrow(ApiError);
    });

    it("accepts a boolean value", () => {
      const result = validateSaveProjectDesignInput({
        ...VALID_BODY,
        sectionSettings: { showGallery: false },
      });

      expect(result.sectionSettings.showGallery).toBe(false);
    });

    it("rejects null as a setting value", () => {
      expect(() =>
        validateSaveProjectDesignInput({
          ...VALID_BODY,
          sectionSettings: { showGallery: null },
        }),
      ).toThrow(ApiError);
    });

    describe("string setting values", () => {
      it("trims leading/trailing whitespace but preserves internal whitespace/newlines", () => {
        const result = validateSaveProjectDesignInput({
          ...VALID_BODY,
          designSettings: { heroHeadline: "  Line one\nLine two  " },
        });

        expect(result.designSettings.heroHeadline).toBe("Line one\nLine two");
      });

      it("rejects an empty-after-trim string setting value", () => {
        expect(() =>
          validateSaveProjectDesignInput({
            ...VALID_BODY,
            designSettings: { heroHeadline: "   " },
          }),
        ).toThrow(ApiError);
      });

      it("enforces MAX_FIELD_LENGTH on the raw (pre-trim) value", () => {
        expect(() =>
          validateSaveProjectDesignInput({
            ...VALID_BODY,
            designSettings: { heroHeadline: "a".repeat(20001) },
          }),
        ).toThrow(ApiError);
      });
    });

    it("safely handles a setting key literally named __proto__ without polluting Object.prototype", () => {
      const raw = JSON.parse(`{"__proto__": "value", "safeKey": true}`) as Record<
        string,
        unknown
      >;

      const result = validateSaveProjectDesignInput({
        ...VALID_BODY,
        sectionSettings: raw,
      });

      expect(result.sectionSettings.safeKey).toBe(true);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it("safely handles constructor/prototype-named setting keys as ordinary own keys", () => {
      const result = validateSaveProjectDesignInput({
        ...VALID_BODY,
        sectionSettings: { constructor: true, prototype: false },
      });

      expect(result.sectionSettings.constructor).toBe(true);
      expect(result.sectionSettings.prototype).toBe(false);
    });
  });

  describe("own-property semantics (Finding C)", () => {
    it("treats a required field satisfied only via the prototype chain as missing", () => {
      const proto = { templateVersionId: VALID_UUID };
      const body = Object.create(proto) as Record<string, unknown>;
      body.paletteKey = VALID_BODY.paletteKey;
      body.fontPresetKey = VALID_BODY.fontPresetKey;
      body.effectPresetKey = VALID_BODY.effectPresetKey;
      body.sectionSettings = VALID_BODY.sectionSettings;
      body.designSettings = VALID_BODY.designSettings;
      // templateVersionId is inherited via the prototype, not an own
      // property of the parsed JSON body.

      const error = validateSaveProjectDesignInput.bind(null, body);
      expect(error).toThrow(ApiError);
      expect(error).toThrow(/templateVersionId.*required/);
    });

    it("does not treat an inherited forbidden field as own caller-supplied input", () => {
      const proto = { isActive: true };
      const body = Object.create(proto) as Record<string, unknown>;
      body.templateVersionId = VALID_BODY.templateVersionId;
      body.paletteKey = VALID_BODY.paletteKey;
      body.fontPresetKey = VALID_BODY.fontPresetKey;
      body.effectPresetKey = VALID_BODY.effectPresetKey;
      body.sectionSettings = VALID_BODY.sectionSettings;
      body.designSettings = VALID_BODY.designSettings;
      // isActive is inherited via the prototype only — this is not caller
      // JSON input and must not be rejected as a forbidden own field.

      const result = validateSaveProjectDesignInput(body);

      expect(result.templateVersionId).toBe(VALID_UUID);
    });
  });
});
