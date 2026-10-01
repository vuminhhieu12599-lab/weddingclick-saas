import { beforeEach, describe, expect, it, vi } from "vitest";

import { RENDERER_SECTION_KEYS } from "../../../lib/invitation-rendering/renderer-compatibility-manifest";
import { createRendererCompatibilityRegistry } from "../../../lib/invitation-rendering/renderer-registry";
import { RendererSelectionInvariantError } from "../../../lib/invitation-rendering/renderer-selection-errors";
import { ELEGANT_EDITORIAL_V1_MANIFEST } from "../../wedding/elegant-editorial/v1/manifest";
import {
  PRODUCTION_COMPATIBILITY_REGISTRY,
  PRODUCTION_RENDERER_KEYS,
  PRODUCTION_RENDERER_MANIFESTS,
  createProductionCompatibilityRegistry,
  validateProductionRendererManifests,
} from "../production-renderer-manifests";
import {
  RENDERER_PRODUCTION_MANIFEST_ERROR_MESSAGES as M,
  RendererProductionManifestInvariantError,
  composeProductionRendererKey,
} from "../renderer-manifest";
import { manifestCopy, manifestWithIdentity } from "./renderer-manifest-fixtures";

/**
 * RF-06A production manifest list, Elegant Editorial v1 exact values and
 * the server-safe production compatibility registry (docs/DECISIONS.md
 * "RF-06-0 …" P14, P16, P20, P21, P27 A).
 */

// Observe (never replace) the frozen RF-04 factory, to prove RF-06 rejects
// duplicates before the RF-04 registry is ever constructed.
vi.mock("../../../lib/invitation-rendering/renderer-registry", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/invitation-rendering/renderer-registry")>();
  return { ...original, createRendererCompatibilityRegistry: vi.fn(original.createRendererCompatibilityRegistry) };
});

const EE_KEY = "wedding.elegant-editorial.v1";

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

beforeEach(() => {
  vi.mocked(createRendererCompatibilityRegistry).mockClear();
});

describe("P16/P21 — Elegant Editorial v1 exact values", () => {
  it("identity", () => {
    expect(ELEGANT_EDITORIAL_V1_MANIFEST.identity).toStrictEqual({
      eventType: "WEDDING",
      templateCode: "elegant-editorial",
      versionNumber: 1,
      displayName: "Elegant Editorial",
    });
  });

  it("compatibility", () => {
    const { compatibility } = ELEGANT_EDITORIAL_V1_MANIFEST;
    expect(compatibility.rendererKey).toBe(EE_KEY);
    expect(compatibility.supportedPayloadSchemaVersions).toStrictEqual([1]);
    expect(compatibility.supportedVariants).toStrictEqual(["COMMON", "GROOM", "BRIDE"]);
    expect(compatibility.sectionCapabilities).toStrictEqual({
      invitationMessage: false,
      loveStory: true,
      gallery: true,
      music: true,
      gift: true,
      timeline: true,
      dressCode: true,
      photoStory: true,
    });
    expect(Object.keys(compatibility)).toStrictEqual([
      "rendererKey",
      "supportedPayloadSchemaVersions",
      "supportedVariants",
      "sectionCapabilities",
    ]);
  });

  it("design", () => {
    const { design } = ELEGANT_EDITORIAL_V1_MANIFEST;
    expect(design.schemaVersion).toBe(1);
    expect(design.palettes).toStrictEqual(["green-ivory"]);
    expect(design.fontPresets).toStrictEqual(["editorial-classic"]);
    expect(design.effectPresets).toStrictEqual(["STANDARD"]);
    expect(design.sectionSettingsSchema).toStrictEqual({
      loveStory: { type: "boolean" },
      gallery: { type: "boolean" },
      music: { type: "boolean" },
      gift: { type: "boolean" },
      timeline: { type: "boolean" },
      dressCode: { type: "boolean" },
      photoStory: { type: "boolean" },
    });
    expect(design.designSettingsSchema).toStrictEqual({});
    expect(Object.keys(design)).toStrictEqual([
      "schemaVersion",
      "palettes",
      "fontPresets",
      "effectPresets",
      "sectionSettingsSchema",
      "designSettingsSchema",
    ]);
  });

  it("the whole manifest, top level and validated copy", () => {
    const expected = {
      identity: { eventType: "WEDDING", templateCode: "elegant-editorial", versionNumber: 1, displayName: "Elegant Editorial" },
      compatibility: {
        rendererKey: EE_KEY,
        supportedPayloadSchemaVersions: [1],
        supportedVariants: ["COMMON", "GROOM", "BRIDE"],
        sectionCapabilities: { invitationMessage: false, loveStory: true, gallery: true, music: true, gift: true, timeline: true, dressCode: true, photoStory: true },
      },
      design: {
        schemaVersion: 1,
        palettes: ["green-ivory"],
        fontPresets: ["editorial-classic"],
        effectPresets: ["STANDARD"],
        sectionSettingsSchema: {
          loveStory: { type: "boolean" },
          gallery: { type: "boolean" },
          music: { type: "boolean" },
          gift: { type: "boolean" },
          timeline: { type: "boolean" },
          dressCode: { type: "boolean" },
          photoStory: { type: "boolean" },
        },
        designSettingsSchema: {},
      },
    };
    expect(ELEGANT_EDITORIAL_V1_MANIFEST).toStrictEqual(expected);
    expect(PRODUCTION_RENDERER_MANIFESTS[0]).toStrictEqual(expected);
    expect(Object.keys(ELEGANT_EDITORIAL_V1_MANIFEST)).toStrictEqual(["identity", "compatibility", "design"]);
  });

  it("rendererKey is exactly the P18 composition of its identity", () => {
    expect(composeProductionRendererKey(ELEGANT_EDITORIAL_V1_MANIFEST.identity)).toBe(EE_KEY);
  });

  it("section capabilities and section settings schema cover exactly RENDERER_SECTION_KEYS", () => {
    const { compatibility, design } = ELEGANT_EDITORIAL_V1_MANIFEST;
    expect(Object.keys(compatibility.sectionCapabilities)).toStrictEqual([...RENDERER_SECTION_KEYS]);
    // Settings exist only for capable sections: v1 is not capable of invitationMessage (Micro-Checkpoint 10).
    expect(Object.keys(design.sectionSettingsSchema)).toStrictEqual(RENDERER_SECTION_KEYS.filter((key) => key !== "invitationMessage"));
  });

  it("a non-empty designSettingsSchema is not the frozen v1 value", () => {
    const changed = manifestCopy();
    changed.design.designSettingsSchema = { accent: { type: "boolean" } };
    expect(changed).not.toStrictEqual(structuredClone(ELEGANT_EDITORIAL_V1_MANIFEST));
    expect(Object.keys(PRODUCTION_RENDERER_MANIFESTS[0]?.design.designSettingsSchema ?? { x: 1 })).toHaveLength(0);
  });
});

describe("P27 — production manifest list and derived keys", () => {
  it("contains exactly Elegant Editorial v1, validated and deeply frozen", () => {
    expect(PRODUCTION_RENDERER_MANIFESTS).toHaveLength(1);
    expect(PRODUCTION_RENDERER_MANIFESTS[0]).toStrictEqual(ELEGANT_EDITORIAL_V1_MANIFEST);
    expect(PRODUCTION_RENDERER_MANIFESTS[0]).not.toBe(ELEGANT_EDITORIAL_V1_MANIFEST);
    expect(isDeepFrozen(PRODUCTION_RENDERER_MANIFESTS)).toBe(true);
  });

  it("derives the key list from the manifest list", () => {
    expect(PRODUCTION_RENDERER_KEYS).toStrictEqual(
      PRODUCTION_RENDERER_MANIFESTS.map((manifest) => manifest.compatibility.rendererKey),
    );
    expect(PRODUCTION_RENDERER_KEYS).toStrictEqual([EE_KEY]);
    expect(Object.isFrozen(PRODUCTION_RENDERER_KEYS)).toBe(true);
  });

  it("every derived key is registered, and nothing else is", () => {
    for (const key of PRODUCTION_RENDERER_KEYS) {
      expect(PRODUCTION_COMPATIBILITY_REGISTRY.compatibility.lookup(key)?.rendererKey).toBe(key);
      expect(PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(key)?.compatibility.rendererKey).toBe(key);
    }
  });
});

describe("P20 — collection validation and duplicate ownership", () => {
  it("rejects a non-array list with the RF-06 error", () => {
    expect(() => validateProductionRendererManifests("x" as never)).toThrow(
      new RendererProductionManifestInvariantError(M.MANIFEST_LIST),
    );
    expect(() => createProductionCompatibilityRegistry({} as never)).toThrow(RendererProductionManifestInvariantError);
  });

  it("rejects a duplicate rendererKey with the RF-06 error before the RF-04 registry is created", () => {
    let caught: unknown;
    try {
      createProductionCompatibilityRegistry([manifestCopy(), manifestCopy()]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RendererProductionManifestInvariantError);
    expect(caught).not.toBeInstanceOf(RendererSelectionInvariantError);
    expect((caught as Error).message).toBe(M.DUPLICATE_RENDERER_KEY);
    expect(createRendererCompatibilityRegistry).not.toHaveBeenCalled();
  });

  it("rejects a duplicate that differs only outside compatibility (never first- or last-write-wins)", () => {
    const second = manifestCopy();
    second.identity.displayName = "Other Name";
    second.compatibility.sectionCapabilities.music = false;
    delete second.design.sectionSettingsSchema.music;
    expect(() => validateProductionRendererManifests([manifestCopy(), second])).toThrow(
      new RendererProductionManifestInvariantError(M.DUPLICATE_RENDERER_KEY),
    );
    expect(() => validateProductionRendererManifests([second, manifestCopy()])).toThrow(
      new RendererProductionManifestInvariantError(M.DUPLICATE_RENDERER_KEY),
    );
  });

  it("an RF-04 compatibility failure inside the list propagates unchanged", () => {
    const bad = manifestCopy();
    bad.compatibility.supportedVariants = [];
    let caught: unknown;
    try {
      createProductionCompatibilityRegistry([manifestCopy(), bad]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RendererSelectionInvariantError);
    expect(caught).not.toBeInstanceOf(RendererProductionManifestInvariantError);
    expect(createRendererCompatibilityRegistry).not.toHaveBeenCalled();
  });

  it("validates every entry (P19) before checking duplicates", () => {
    const bad = manifestCopy();
    bad.identity.templateCode = "Bad";
    expect(() => validateProductionRendererManifests([manifestCopy(), manifestCopy(), bad])).toThrow(
      new RendererProductionManifestInvariantError(M.TEMPLATE_CODE),
    );
  });

  it("accepts distinct keys in explicit input order", () => {
    const list = validateProductionRendererManifests([
      manifestWithIdentity("elegant-editorial", 2),
      manifestCopy(),
    ]);
    expect(list.map((m) => m.compatibility.rendererKey)).toStrictEqual([
      "wedding.elegant-editorial.v2",
      EE_KEY,
    ]);
  });
});

describe("P27 A — server-safe production compatibility registry", () => {
  it("exposes only the compatibility registry and full-manifest lookup", () => {
    expect(Object.keys(PRODUCTION_COMPATIBILITY_REGISTRY).sort()).toStrictEqual(["compatibility", "lookupManifest"]);
    expect(Object.isFrozen(PRODUCTION_COMPATIBILITY_REGISTRY)).toBe(true);
    expect(Object.keys(PRODUCTION_COMPATIBILITY_REGISTRY.compatibility)).toStrictEqual(["lookup"]);
  });

  it("projects exactly the four RF-04 fields into the compatibility registry", () => {
    const projected = PRODUCTION_COMPATIBILITY_REGISTRY.compatibility.lookup(EE_KEY);
    expect(projected).toStrictEqual(ELEGANT_EDITORIAL_V1_MANIFEST.compatibility);
    expect(Object.keys(projected ?? {})).toStrictEqual([
      "rendererKey",
      "supportedPayloadSchemaVersions",
      "supportedVariants",
      "sectionCapabilities",
    ]);
    const serialized = JSON.stringify(projected);
    for (const leaked of ["identity", "design", "displayName", "templateCode", "versionNumber", "Elegant Editorial", "green-ivory"]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("returns the validated, deeply frozen full manifest by exact key", () => {
    const manifest = PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(EE_KEY);
    expect(manifest).toStrictEqual(ELEGANT_EDITORIAL_V1_MANIFEST);
    expect(isDeepFrozen(manifest)).toBe(true);
    expect(isDeepFrozen(PRODUCTION_COMPATIBILITY_REGISTRY.compatibility.lookup(EE_KEY))).toBe(true);
  });

  it.each([
    "",
    "wedding.elegant-editorial.v2",
    "wedding.elegant-editorial.v0",
    "wedding.elegant-editorial",
    "wedding.elegant-editorial.v",
    "wedding.elegant-editorial.latest",
    "Wedding.elegant-editorial.v1",
    "WEDDING.elegant-editorial.v1",
    " wedding.elegant-editorial.v1",
    "wedding.elegant-editorial.v1 ",
    "elegant-editorial",
    "Elegant Editorial",
    "wedding.green-ivory-editorial.v1",
    "default",
    "latest",
    "__proto__",
    "constructor",
  ])("unknown key %j is fail-closed (no normalization, fallback, default or latest)", (key) => {
    expect(PRODUCTION_COMPATIBILITY_REGISTRY.compatibility.lookup(key)).toBeUndefined();
    expect(PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(key)).toBeUndefined();
  });

  it("builds the RF-04 registry exactly once from the projected compatibility manifests", () => {
    const registry = createProductionCompatibilityRegistry([manifestCopy()]);
    expect(createRendererCompatibilityRegistry).toHaveBeenCalledTimes(1);
    const [[passed]] = vi.mocked(createRendererCompatibilityRegistry).mock.calls as [[readonly unknown[]]];
    expect(passed).toStrictEqual([ELEGANT_EDITORIAL_V1_MANIFEST.compatibility]);
    expect(registry.compatibility.lookup(EE_KEY)).toStrictEqual(ELEGANT_EDITORIAL_V1_MANIFEST.compatibility);
  });
});

describe("mutation ownership", () => {
  it("later mutation of the caller's manifest cannot change a built registry", () => {
    const source = manifestCopy();
    const registry = createProductionCompatibilityRegistry([source]);

    source.compatibility.sectionCapabilities.gift = false;
    (source.compatibility.supportedVariants as string[]).pop();
    source.compatibility.rendererKey = "wedding.hijacked.v1";
    source.identity.displayName = "Hijacked";
    (source.design.palettes as string[]).push("hijacked");

    expect(registry.compatibility.lookup(EE_KEY)).toStrictEqual(ELEGANT_EDITORIAL_V1_MANIFEST.compatibility);
    expect(registry.lookupManifest(EE_KEY)).toStrictEqual(ELEGANT_EDITORIAL_V1_MANIFEST);
    expect(registry.compatibility.lookup("wedding.hijacked.v1")).toBeUndefined();
  });

  it("returned registry-owned manifests cannot be mutated", () => {
    const manifest = PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(EE_KEY);
    expect(() => {
      (manifest?.compatibility.sectionCapabilities as { gift: boolean }).gift = false;
    }).toThrow(TypeError);
    expect(() => {
      manifest?.design.palettes.push("x");
    }).toThrow(TypeError);
    expect(PRODUCTION_COMPATIBILITY_REGISTRY.compatibility.lookup(EE_KEY)?.sectionCapabilities.gift).toBe(true);
  });

  it("the validated list shares no object with its input", () => {
    const source = manifestCopy();
    const [validated] = validateProductionRendererManifests([source]);
    expect(validated).not.toBe(source);
    expect(validated?.design).not.toBe(source.design);
    expect(Object.isFrozen(source)).toBe(false);
  });
});
