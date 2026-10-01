import { describe, expect, it } from "vitest";

import {
  RENDERER_SECTION_KEYS,
  projectCompatibilityManifest,
} from "../../../lib/invitation-rendering/renderer-compatibility-manifest";
import { RendererSelectionInvariantError } from "../../../lib/invitation-rendering/renderer-selection-errors";
import { ELEGANT_EDITORIAL_V1_MANIFEST } from "../../wedding/elegant-editorial/v1/manifest";
import {
  PRODUCTION_TEMPLATE_CODE_PATTERN,
  RENDERER_KEY_EVENT_SEGMENT,
  RENDERER_PRODUCTION_MANIFEST_ERROR_MESSAGES as M,
  RendererProductionManifestInvariantError,
  composeProductionRendererKey,
  validateRendererProductionManifest,
} from "../renderer-manifest";
import { ECHO_SENTINEL, manifestCopy, type MutableManifest } from "./renderer-manifest-fixtures";

/** The sections the Elegant Editorial v1 fixture manifest is capable of (Micro-Checkpoint 10: not invitationMessage). */
const CAPABLE_SECTION_KEYS = RENDERER_SECTION_KEYS.filter((key) => ELEGANT_EDITORIAL_V1_MANIFEST.compatibility.sectionCapabilities[key]);

/**
 * RF-06A full production manifest contract (docs/DECISIONS.md "RF-06-0 …"
 * P15, P18–P21): closed shape, identity, key composition, design
 * closedness, fail-fast order and error ownership.
 */

function expectRf06(fn: () => unknown, message: string): RendererProductionManifestInvariantError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RendererProductionManifestInvariantError);
  const error = caught as RendererProductionManifestInvariantError;
  expect(error.name).toBe("RendererProductionManifestInvariantError");
  expect(error.message).toBe(message);
  expect(error.message).not.toContain(ECHO_SENTINEL);
  return error;
}

function validateWith(mutate: (manifest: MutableManifest) => void): () => unknown {
  const manifest = manifestCopy();
  mutate(manifest);
  return () => validateRendererProductionManifest(manifest);
}

describe("valid manifest", () => {
  it("accepts the Elegant Editorial v1 manifest and returns an equal fresh projection", () => {
    const input = manifestCopy();
    const result = validateRendererProductionManifest(input);
    expect(result).toEqual(ELEGANT_EDITORIAL_V1_MANIFEST);
    expect(result).not.toBe(input);
    expect(result.identity).not.toBe(input.identity);
    expect(result.compatibility).not.toBe(input.compatibility);
    expect(result.compatibility.supportedVariants).not.toBe(input.compatibility.supportedVariants);
    expect(result.design).not.toBe(input.design);
    expect(result.design.palettes).not.toBe(input.design.palettes);
    expect(result.design.sectionSettingsSchema).not.toBe(input.design.sectionSettingsSchema);
    expect(result.design.sectionSettingsSchema.gift).not.toBe(input.design.sectionSettingsSchema.gift);
  });

  it("returns exactly the three top-level, four identity and six design keys, with no enumValues added", () => {
    const result = validateRendererProductionManifest(manifestCopy());
    expect(Object.keys(result)).toEqual(["identity", "compatibility", "design"]);
    expect(Object.keys(result.identity)).toEqual(["eventType", "templateCode", "versionNumber", "displayName"]);
    expect(Object.keys(result.design)).toEqual([
      "schemaVersion",
      "palettes",
      "fontPresets",
      "effectPresets",
      "sectionSettingsSchema",
      "designSettingsSchema",
    ]);
    // Settings exist exactly for the capable sections (v1 is not capable of invitationMessage).
    expect(Object.keys(result.design.sectionSettingsSchema)).toEqual(CAPABLE_SECTION_KEYS);
    for (const key of CAPABLE_SECTION_KEYS) {
      expect(Object.keys(result.design.sectionSettingsSchema[key] ?? {})).toEqual(["type"]);
    }
    expect(JSON.stringify(result)).toBe(JSON.stringify(ELEGANT_EDITORIAL_V1_MANIFEST));
  });

  it("never mutates its input", () => {
    const input = manifestCopy();
    const before = structuredClone(input);
    validateRendererProductionManifest(input);
    expect(input).toEqual(before);
  });

  it("accepts a frozen input", () => {
    const input = manifestCopy();
    Object.freeze(input.design.palettes);
    Object.freeze(input.identity);
    Object.freeze(input);
    expect(validateRendererProductionManifest(input)).toEqual(ELEGANT_EDITORIAL_V1_MANIFEST);
  });
});

describe("P19 step 1 — exact top-level shape", () => {
  it.each([null, undefined, "manifest", 1, true, [], [manifestCopy()]])("rejects a non-object manifest %#", (value) => {
    expectRf06(() => validateRendererProductionManifest(value), M.MANIFEST_NOT_PLAIN_OBJECT);
  });

  it("rejects a class instance", () => {
    class Manifest {
      identity = manifestCopy().identity;
      compatibility = manifestCopy().compatibility;
      design = manifestCopy().design;
    }
    expectRf06(() => validateRendererProductionManifest(new Manifest()), M.MANIFEST_NOT_PLAIN_OBJECT);
  });

  it("rejects an extra top-level key without echoing it", () => {
    expectRf06(
      validateWith((m) => {
        m[ECHO_SENTINEL] = ECHO_SENTINEL;
      }),
      M.MANIFEST_KEYS,
    );
  });

  it.each(["rendererKey", "id", "templateVersionId", "component", "isActive", "supportedFeatures"])(
    "rejects a forbidden top-level %s",
    (key) => {
      expectRf06(
        validateWith((m) => {
          m[key] = "x";
        }),
        M.MANIFEST_KEYS,
      );
    },
  );

  it.each(["identity", "compatibility", "design"])("rejects a missing %s", (key) => {
    expectRf06(
      validateWith((m) => {
        delete m[key];
      }),
      M.MANIFEST_KEYS,
    );
  });

  it("rejects an inherited required key", () => {
    const { identity, compatibility, design } = manifestCopy();
    const value = Object.create({ design }) as Record<string, unknown>;
    value.identity = identity;
    value.compatibility = compatibility;
    expectRf06(() => validateRendererProductionManifest(value), M.MANIFEST_NOT_PLAIN_OBJECT);
    const nullProto = Object.assign(Object.create(null) as Record<string, unknown>, { identity, compatibility });
    expectRf06(() => validateRendererProductionManifest(nullProto), M.MANIFEST_KEYS);
  });

  it("rejects a symbol, non-enumerable or accessor member", () => {
    expectRf06(
      validateWith((m) => {
        (m as Record<symbol, unknown>)[Symbol("extra")] = 1;
      }),
      M.MANIFEST_KEYS,
    );
    expectRf06(
      validateWith((m) => {
        Object.defineProperty(m, "hidden", { value: 1, enumerable: false });
      }),
      M.MANIFEST_KEYS,
    );
    expectRf06(
      validateWith((m) => {
        const { design } = m;
        Object.defineProperty(m, "design", { get: () => design, enumerable: true, configurable: true });
      }),
      M.MANIFEST_KEYS,
    );
  });
});

describe("P19 step 2 — identity", () => {
  it.each([null, "identity", [], 7])("rejects a non-object identity %#", (value) => {
    expectRf06(
      validateWith((m) => {
        m.identity = value as never;
      }),
      M.IDENTITY_NOT_PLAIN_OBJECT,
    );
  });

  it.each(["rendererKey", "id", "name", "code", ECHO_SENTINEL])("rejects an extra identity key %s", (key) => {
    expectRf06(
      validateWith((m) => {
        m.identity[key] = "wedding.elegant-editorial.v1";
      }),
      M.IDENTITY_KEYS,
    );
  });

  it.each(["eventType", "templateCode", "versionNumber", "displayName"])("rejects a missing identity %s", (key) => {
    expectRf06(
      validateWith((m) => {
        delete m.identity[key];
      }),
      M.IDENTITY_KEYS,
    );
  });

  it.each(["wedding", "BIRTHDAY", "", " WEDDING", "Wedding", 1, null])("rejects eventType %j", (value) => {
    expectRf06(
      validateWith((m) => {
        m.identity.eventType = value;
      }),
      M.EVENT_TYPE,
    );
  });

  it.each([
    "",
    "Elegant-Editorial",
    "elegant_editorial",
    "elegant.editorial",
    "elegant-editorial.v1",
    " elegant-editorial",
    "elegant-editorial ",
    "-elegant",
    "elegant-",
    "elegant--editorial",
    "elegant editorial",
    "élégant",
    1,
    null,
  ])("rejects templateCode %j without normalizing", (value) => {
    expectRf06(
      validateWith((m) => {
        m.identity.templateCode = value;
      }),
      M.TEMPLATE_CODE,
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1", null, BigInt(1)])(
    "rejects versionNumber %s",
    (value) => {
      expectRf06(
        validateWith((m) => {
          m.identity.versionNumber = value;
        }),
        M.VERSION_NUMBER,
      );
    },
  );

  it("accepts the largest safe integer version (no INT4 bound in RF-06A)", () => {
    const m = manifestCopy();
    m.identity.versionNumber = Number.MAX_SAFE_INTEGER;
    m.compatibility.rendererKey = `wedding.elegant-editorial.v${String(Number.MAX_SAFE_INTEGER)}`;
    expect(validateRendererProductionManifest(m).identity.versionNumber).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each(["", " ", " Elegant Editorial", "Elegant Editorial ", "Elegant Editorial\n", 1, null])(
    "rejects displayName %j",
    (value) => {
      expectRf06(
        validateWith((m) => {
          m.identity.displayName = value;
        }),
        M.DISPLAY_NAME,
      );
    },
  );

  it("does not use displayName in the renderer key", () => {
    const m = manifestCopy();
    m.identity.displayName = "Completely Different Name";
    expect(validateRendererProductionManifest(m).compatibility.rendererKey).toBe("wedding.elegant-editorial.v1");
  });
});

describe("P18 — renderer key composition", () => {
  it("maps every EventType through the closed segment map", () => {
    expect(RENDERER_KEY_EVENT_SEGMENT).toEqual({ WEDDING: "wedding" });
    expect(Object.isFrozen(RENDERER_KEY_EVENT_SEGMENT)).toBe(true);
  });

  it("composes segment + '.' + templateCode + '.v' + versionNumber", () => {
    expect(composeProductionRendererKey({ eventType: "WEDDING", templateCode: "elegant-editorial", versionNumber: 1 })).toBe(
      "wedding.elegant-editorial.v1",
    );
    expect(composeProductionRendererKey({ eventType: "WEDDING", templateCode: "a-b-2", versionNumber: 12 })).toBe(
      `${RENDERER_KEY_EVENT_SEGMENT.WEDDING}.a-b-2.v12`,
    );
  });

  it("uses the P18 template code pattern", () => {
    expect(PRODUCTION_TEMPLATE_CODE_PATTERN.source).toBe("^[a-z0-9]+(-[a-z0-9]+)*$");
  });

  it("refuses an event type outside the closed map", () => {
    expectRf06(
      () => composeProductionRendererKey({ eventType: "BIRTHDAY" as never, templateCode: "x", versionNumber: 1 }),
      M.EVENT_TYPE,
    );
  });

  it.each([
    "wedding.elegant-editorial.v2",
    "wedding.elegant-editorial",
    "Wedding.elegant-editorial.v1",
    "wedding.elegant-editorial.v01",
    " wedding.elegant-editorial.v1",
    "wedding.Elegant Editorial.v1",
  ])("rejects a mismatched compatibility.rendererKey %j", (rendererKey) => {
    expectRf06(
      validateWith((m) => {
        m.compatibility.rendererKey = rendererKey;
      }),
      M.RENDERER_KEY_MISMATCH,
    );
  });

  it("rejects a key that matches only after changing identity", () => {
    expectRf06(
      validateWith((m) => {
        m.identity.versionNumber = 2;
      }),
      M.RENDERER_KEY_MISMATCH,
    );
  });
});

describe("P19 step 3 — RF-04 compatibility errors propagate unchanged", () => {
  const cases: [string, (m: MutableManifest) => void][] = [
    ["non-object compatibility", (m) => (m.compatibility = null as never)],
    ["empty rendererKey", (m) => (m.compatibility.rendererKey = "")],
    ["extra compatibility key", (m) => (m.compatibility.displayName = "x")],
    ["empty variants", (m) => (m.compatibility.supportedVariants = [])],
    ["duplicate variants", (m) => (m.compatibility.supportedVariants = ["COMMON", "COMMON"])],
    ["unknown payload version", (m) => (m.compatibility.supportedPayloadSchemaVersions = [2])],
    ["missing section capability", (m) => delete m.compatibility.sectionCapabilities.gift],
    ["non-boolean capability", (m) => (m.compatibility.sectionCapabilities.gift = "true")],
  ];

  it.each(cases)("%s", (_label, mutate) => {
    const m = manifestCopy();
    mutate(m);
    let direct: unknown;
    try {
      projectCompatibilityManifest(m.compatibility);
    } catch (error) {
      direct = error;
    }
    let caught: unknown;
    try {
      validateRendererProductionManifest(m);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RendererSelectionInvariantError);
    expect(caught).not.toBeInstanceOf(RendererProductionManifestInvariantError);
    expect((caught as Error).message).toBe((direct as Error).message);
  });
});

describe("P19 step 5 — design closedness and Task 028 reuse", () => {
  it.each([null, "design", [], 1])("rejects a non-object design %#", (value) => {
    expectRf06(
      validateWith((m) => {
        m.design = value as never;
      }),
      M.DESIGN_NOT_PLAIN_OBJECT,
    );
  });

  it.each(["layout", "fonts", "assets", "rendererKey", ECHO_SENTINEL])(
    "rejects an unknown design top-level key %s that Task 028 alone would ignore",
    (key) => {
      expectRf06(
        validateWith((m) => {
          m.design[key] = ECHO_SENTINEL;
        }),
        M.DESIGN_KEYS,
      );
    },
  );

  it.each(["schemaVersion", "palettes", "fontPresets", "effectPresets", "sectionSettingsSchema", "designSettingsSchema"])(
    "rejects a missing design %s",
    (key) => {
      expectRf06(
        validateWith((m) => {
          delete m.design[key];
        }),
        M.DESIGN_KEYS,
      );
    },
  );

  const task028Failures: [string, (m: MutableManifest) => void][] = [
    ["schemaVersion 2", (m) => (m.design.schemaVersion = 2)],
    ["non-array palettes", (m) => (m.design.palettes = ECHO_SENTINEL)],
    ["non-string palette", (m) => (m.design.palettes = [7])],
    ["blank palette", (m) => (m.design.palettes = ["   "])],
    ["duplicate font preset", (m) => (m.design.fontPresets = ["editorial-classic", "editorial-classic"])],
    ["unknown section setting-spec property", (m) => (m.design.sectionSettingsSchema.gift = { type: "boolean", default: ECHO_SENTINEL })],
    ["unknown design setting-spec property", (m) => (m.design.designSettingsSchema = { accent: { type: "string", label: ECHO_SENTINEL } })],
    ["unknown setting type", (m) => (m.design.sectionSettingsSchema.gift = { type: ECHO_SENTINEL })],
    ["non-object settings schema", (m) => (m.design.designSettingsSchema = [] as never)],
    ["mistyped enumValues", (m) => (m.design.designSettingsSchema = { accent: { type: "string", enumValues: [1] } })],
  ];

  it.each(task028Failures)("rethrows a Task 028 failure (%s) with the fixed message and no cause", (_label, mutate) => {
    const error = expectRf06(validateWith(mutate), M.DESIGN_TASK028_INVALID);
    expect(error.cause).toBeUndefined();
    expect(error.message).not.toContain("Template version design manifest is malformed");
  });

  const normalizationCases: [string, (m: MutableManifest) => void][] = [
    ["padded palette", (m) => (m.design.palettes = [" green-ivory"])],
    ["padded font preset", (m) => (m.design.fontPresets = ["editorial-classic "])],
    ["padded effect preset", (m) => (m.design.effectPresets = ["\tSTANDARD"])],
    [
      "padded section key",
      (m) => {
        const { gift, ...rest } = m.design.sectionSettingsSchema;
        m.design.sectionSettingsSchema = { ...rest, " gift": gift };
      },
    ],
    ["padded design setting key", (m) => (m.design.designSettingsSchema = { " accent": { type: "boolean" } })],
    ["padded enum value", (m) => (m.design.designSettingsSchema = { accent: { type: "string", enumValues: [" gold"] } })],
  ];

  it.each(normalizationCases)("rejects reliance on Task 028 trim normalization (%s)", (_label, mutate) => {
    expectRf06(validateWith(mutate), M.DESIGN_NORMALIZED);
  });

  it.each(["palettes", "fontPresets", "effectPresets"])("rejects an empty %s", (key) => {
    expectRf06(
      validateWith((m) => {
        m.design[key] = [];
      }),
      M.DESIGN_EMPTY_KEY_SET,
    );
  });

  it("does not drop an explicit design setting spec or add enumValues", () => {
    const m = manifestCopy();
    m.design.designSettingsSchema = { accent: { type: "string", enumValues: ["gold", "silver"] }, scale: { type: "number" } };
    const result = validateRendererProductionManifest(m);
    expect(result.design.designSettingsSchema).toEqual({
      accent: { type: "string", enumValues: ["gold", "silver"] },
      scale: { type: "number" },
    });
    expect(Object.keys(result.design.designSettingsSchema.scale ?? {})).toEqual(["type"]);
  });

  it("keeps a __proto__ design setting key as data", () => {
    const m = manifestCopy();
    m.design.designSettingsSchema = JSON.parse('{"__proto__": {"type": "boolean"}}') as Record<string, unknown>;
    const result = validateRendererProductionManifest(m);
    expect(Object.getPrototypeOf(result.design.designSettingsSchema)).toBe(Object.prototype);
    expect(Object.keys(result.design.designSettingsSchema)).toEqual(["__proto__"]);
  });
});

describe("P19 step 6 — section settings schema vs renderer sections", () => {
  it.each(["hero", "opening", "calendar", "countdown", "rsvp", "RSVP"])("rejects pseudo-section key %s", (key) => {
    expectRf06(
      validateWith((m) => {
        m.design.sectionSettingsSchema[key] = { type: "boolean" };
      }),
      M.SECTION_SETTING_KEY,
    );
  });

  it.each(CAPABLE_SECTION_KEYS)("rejects a missing section setting %s while the section is capable", (key) => {
    expectRf06(
      validateWith((m) => {
        delete m.design.sectionSettingsSchema[key];
      }),
      M.SECTION_SETTING_CAPABILITY_MISMATCH,
    );
  });

  it.each([
    ["string spec", { type: "string" }],
    ["number spec", { type: "number" }],
    ["boolean spec with enumValues", { type: "boolean", enumValues: [true, false] }],
    ["boolean spec with undefined enumValues", { type: "boolean", enumValues: undefined }],
  ])("rejects a non-exact boolean spec (%s)", (_label, spec) => {
    expectRf06(
      validateWith((m) => {
        m.design.sectionSettingsSchema.gallery = spec;
      }),
      M.SECTION_SETTING_SPEC,
    );
  });

  it("rejects a setting for a section the renderer is not capable of", () => {
    expectRf06(
      validateWith((m) => {
        m.compatibility.sectionCapabilities.music = false;
      }),
      M.SECTION_SETTING_CAPABILITY_MISMATCH,
    );
  });

  it("accepts an incapable section only when its setting is absent", () => {
    const m = manifestCopy();
    m.compatibility.sectionCapabilities.music = false;
    delete m.design.sectionSettingsSchema.music;
    const result = validateRendererProductionManifest(m);
    expect(Object.keys(result.design.sectionSettingsSchema)).toEqual(["loveStory", "gallery", "gift", "timeline", "dressCode", "photoStory"]);
  });
});

describe("P19 fail-fast order with multiply-invalid input", () => {
  it("step 1 before step 2", () => {
    expectRf06(
      validateWith((m) => {
        m.extra = 1;
        m.identity.eventType = "BIRTHDAY";
      }),
      M.MANIFEST_KEYS,
    );
  });

  it("identity members in order: eventType, templateCode, versionNumber, displayName", () => {
    const all = (m: MutableManifest) => {
      m.identity.eventType = "BIRTHDAY";
      m.identity.templateCode = "Bad.Code";
      m.identity.versionNumber = 0;
      m.identity.displayName = " ";
    };
    expectRf06(validateWith(all), M.EVENT_TYPE);
    expectRf06(
      validateWith((m) => {
        all(m);
        m.identity.eventType = "WEDDING";
      }),
      M.TEMPLATE_CODE,
    );
    expectRf06(
      validateWith((m) => {
        all(m);
        m.identity.eventType = "WEDDING";
        m.identity.templateCode = "elegant-editorial";
      }),
      M.VERSION_NUMBER,
    );
    expectRf06(
      validateWith((m) => {
        all(m);
        m.identity.eventType = "WEDDING";
        m.identity.templateCode = "elegant-editorial";
        m.identity.versionNumber = 1;
      }),
      M.DISPLAY_NAME,
    );
  });

  it("identity keys before identity values", () => {
    expectRf06(
      validateWith((m) => {
        m.identity.extra = 1;
        m.identity.eventType = "BIRTHDAY";
      }),
      M.IDENTITY_KEYS,
    );
  });

  it("step 2 (RF-06) before step 3 (RF-04)", () => {
    expectRf06(
      validateWith((m) => {
        m.identity.templateCode = "";
        m.compatibility.supportedVariants = [];
      }),
      M.TEMPLATE_CODE,
    );
  });

  it("step 3 (RF-04) before steps 4–6", () => {
    const m = manifestCopy();
    m.compatibility.supportedVariants = ["MAYBE"];
    m.compatibility.rendererKey = "wedding.other.v9";
    m.design.extra = 1;
    m.design.sectionSettingsSchema.hero = { type: "boolean" };
    expect(() => validateRendererProductionManifest(m)).toThrow(RendererSelectionInvariantError);
  });

  it("step 4 before step 5", () => {
    expectRf06(
      validateWith((m) => {
        m.compatibility.rendererKey = "wedding.other.v9";
        m.design.extra = 1;
      }),
      M.RENDERER_KEY_MISMATCH,
    );
  });

  it("step 5 closedness before the Task 028 validator", () => {
    expectRf06(
      validateWith((m) => {
        m.design.extra = 1;
        m.design.schemaVersion = 2;
      }),
      M.DESIGN_KEYS,
    );
  });

  it("step 5 Task 028 before normalization before non-empty", () => {
    expectRf06(
      validateWith((m) => {
        m.design.schemaVersion = 2;
        m.design.palettes = [" green-ivory"];
      }),
      M.DESIGN_TASK028_INVALID,
    );
    expectRf06(
      validateWith((m) => {
        m.design.palettes = [" green-ivory"];
        m.design.effectPresets = [];
      }),
      M.DESIGN_NORMALIZED,
    );
  });

  it("step 5 before step 6", () => {
    expectRf06(
      validateWith((m) => {
        m.design.fontPresets = [];
        m.design.sectionSettingsSchema.hero = { type: "boolean" };
      }),
      M.DESIGN_EMPTY_KEY_SET,
    );
  });

  it("step 6: unknown key before spec shape before capability equality", () => {
    expectRf06(
      validateWith((m) => {
        m.design.sectionSettingsSchema.gift = { type: "string" };
        m.design.sectionSettingsSchema.hero = { type: "boolean" };
        delete m.design.sectionSettingsSchema.music;
      }),
      M.SECTION_SETTING_KEY,
    );
    expectRf06(
      validateWith((m) => {
        m.design.sectionSettingsSchema.gift = { type: "string" };
        delete m.design.sectionSettingsSchema.music;
      }),
      M.SECTION_SETTING_SPEC,
    );
  });
});

describe("error messages never echo manifest content", () => {
  it("uses only the fixed message table", () => {
    const messages = Object.values(M);
    const probes: (() => unknown)[] = [
      validateWith((m) => (m[ECHO_SENTINEL] = 1)),
      validateWith((m) => (m.identity.templateCode = ECHO_SENTINEL)),
      validateWith((m) => (m.identity.displayName = ` ${ECHO_SENTINEL}`)),
      validateWith((m) => (m.design[ECHO_SENTINEL] = 1)),
      validateWith((m) => (m.design.palettes = [ECHO_SENTINEL, ECHO_SENTINEL])),
      validateWith((m) => (m.design.sectionSettingsSchema[ECHO_SENTINEL] = { type: "boolean" })),
    ];
    for (const probe of probes) {
      let caught: unknown;
      try {
        probe();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(RendererProductionManifestInvariantError);
      expect(messages).toContain((caught as Error).message);
      expect((caught as Error).message).not.toContain(ECHO_SENTINEL);
    }
  });
});
