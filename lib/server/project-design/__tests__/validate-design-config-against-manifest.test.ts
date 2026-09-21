import { describe, expect, it } from "vitest";

import type { TemplateDesignManifestV1 } from "../../../domain";
import { ApiError } from "../../errors/api-error";
import type { SaveProjectDesignInput } from "../project-design-types";
import { validateDesignConfigAgainstManifest } from "../validate-design-config-against-manifest";

const MANIFEST: TemplateDesignManifestV1 = {
  schemaVersion: 1,
  palettes: ["ivory-champagne", "blush-floral"],
  fontPresets: ["editorial-classic"],
  effectPresets: ["NONE", "LIGHT"],
  sectionSettingsSchema: {
    showGallery: { type: "boolean" },
    galleryColumns: { type: "number", enumValues: [2, 3, 4] },
  },
  designSettingsSchema: {
    heroHeadline: { type: "string", enumValues: ["A", "B"] },
    freeText: { type: "string" },
  },
};

function baseInput(overrides?: Partial<SaveProjectDesignInput>): SaveProjectDesignInput {
  return {
    templateVersionId: "22222222-2222-2222-2222-222222222222",
    paletteKey: "ivory-champagne",
    fontPresetKey: "editorial-classic",
    effectPresetKey: "NONE",
    sectionSettings: {},
    designSettings: {},
    ...overrides,
  };
}

describe("validateDesignConfigAgainstManifest", () => {
  it("accepts a fully valid config", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(
        baseInput({
          sectionSettings: { showGallery: true, galleryColumns: 3 },
          designSettings: { heroHeadline: "A", freeText: "anything" },
        }),
        MANIFEST,
      ),
    ).not.toThrow();
  });

  it("does not require every manifest schema key to be present (allow-list, not required-list)", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(baseInput({ sectionSettings: {}, designSettings: {} }), MANIFEST),
    ).not.toThrow();
  });

  it("rejects an unsupported paletteKey", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(baseInput({ paletteKey: "not-declared" }), MANIFEST),
    ).toThrow(ApiError);
  });

  it("rejects an unsupported fontPresetKey", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(baseInput({ fontPresetKey: "not-declared" }), MANIFEST),
    ).toThrow(ApiError);
  });

  it("rejects an unsupported effectPresetKey", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(baseInput({ effectPresetKey: "not-declared" }), MANIFEST),
    ).toThrow(ApiError);
  });

  it("rejects an undeclared sectionSettings key", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(
        baseInput({ sectionSettings: { undeclaredKey: true } }),
        MANIFEST,
      ),
    ).toThrow(ApiError);
  });

  it("rejects an undeclared designSettings key", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(
        baseInput({ designSettings: { undeclaredKey: "x" } }),
        MANIFEST,
      ),
    ).toThrow(ApiError);
  });

  it("rejects a wrong primitive type for a declared key (string sent for a boolean spec)", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(
        baseInput({ sectionSettings: { showGallery: "true" } }),
        MANIFEST,
      ),
    ).toThrow(ApiError);
  });

  it("rejects a wrong primitive type for a declared key (number sent for a string spec)", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(
        baseInput({ designSettings: { freeText: 123 } }),
        MANIFEST,
      ),
    ).toThrow(ApiError);
  });

  it("rejects a value not present in a declared enum", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(
        baseInput({ designSettings: { heroHeadline: "C" } }),
        MANIFEST,
      ),
    ).toThrow(ApiError);
  });

  it("rejects a numeric value not present in a declared enum", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(
        baseInput({ sectionSettings: { galleryColumns: 99 } }),
        MANIFEST,
      ),
    ).toThrow(ApiError);
  });

  it("accepts any string value for a spec with no enumValues declared", () => {
    expect(() =>
      validateDesignConfigAgainstManifest(
        baseInput({ designSettings: { freeText: "anything goes here" } }),
        MANIFEST,
      ),
    ).not.toThrow();
  });

  it("never coerces — a boolean-typed spec never accepts 1/0", () => {
    const manifestWithBooleanEnum: TemplateDesignManifestV1 = {
      ...MANIFEST,
      sectionSettingsSchema: {
        showGallery: { type: "boolean", enumValues: [true] },
      },
    };

    expect(() =>
      validateDesignConfigAgainstManifest(
        // sectionSettings values are already restricted to string|number|boolean
        // by validate-save-project-design-input.ts; a number here simulates a
        // caller that bypassed that layer, exercising this layer's own guard.
        baseInput({ sectionSettings: { showGallery: 1 as unknown as boolean } }),
        manifestWithBooleanEnum,
      ),
    ).toThrow(ApiError);
  });
});
