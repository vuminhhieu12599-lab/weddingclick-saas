import { describe, expect, expectTypeOf, it } from "vitest";

import {
  RENDERER_SECTION_KEYS,
  type RendererCompatibilityManifestV1,
  type RendererSectionKey,
} from "../renderer-compatibility-manifest";
import { createRendererCompatibilityRegistry } from "../renderer-registry";
import { RendererSelectionError, RendererSelectionInvariantError } from "../renderer-selection-errors";
import type { SnapshotSections } from "../snapshot-payload-types";
import { TEST_KEY_V1, TEST_KEY_V2, manifest } from "./renderer-selection-fixtures";

/** Runtime-mutated/cast manifest that static types would reject. */
function malformed(mutate: (m: Record<string, unknown>) => void): RendererCompatibilityManifestV1 {
  const m = manifest() as unknown as Record<string, unknown>;
  mutate(m);
  return m as unknown as RendererCompatibilityManifestV1;
}

function expectInvariant(manifests: readonly RendererCompatibilityManifestV1[]): void {
  let caught: unknown;
  try {
    createRendererCompatibilityRegistry(manifests);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RendererSelectionInvariantError);
  expect(caught).not.toBeInstanceOf(RendererSelectionError);
}

describe("RF-04 section key vocabulary (R7, R8)", () => {
  it("is exactly the Snapshot Sections v1 keys, with the additive timeline and dressCode keys last (RF7 amendments)", () => {
    expect([...RENDERER_SECTION_KEYS]).toEqual(["invitationMessage", "loveStory", "gallery", "music", "gift", "timeline", "dressCode", "photoStory"]);
    expectTypeOf<RendererSectionKey>().toEqualTypeOf<keyof SnapshotSections>();
  });
});

describe("createRendererCompatibilityRegistry — construction and exact lookup (R4, R12, R13)", () => {
  it("registers a valid manifest and looks it up by its own rendererKey", () => {
    const registry = createRendererCompatibilityRegistry([manifest()]);
    expect(registry.lookup(TEST_KEY_V1)).toEqual(manifest());
  });

  it("holds multiple keys and returns each exact key's manifest only", () => {
    const v1 = manifest({ supportedVariants: ["COMMON"] });
    const v2 = manifest({ rendererKey: TEST_KEY_V2, supportedVariants: ["BRIDE"] });
    const registry = createRendererCompatibilityRegistry([v1, v2]);

    expect(registry.lookup(TEST_KEY_V1)?.supportedVariants).toEqual(["COMMON"]);
    expect(registry.lookup(TEST_KEY_V2)?.supportedVariants).toEqual(["BRIDE"]);
  });

  it("does no prefix, version-family, case, whitespace or default matching", () => {
    const registry = createRendererCompatibilityRegistry([manifest()]);
    for (const key of ["test.renderer", "test.renderer.v", "test.renderer.v10", "TEST.RENDERER.V1", ` ${TEST_KEY_V1}`, `${TEST_KEY_V1} `, ""]) {
      expect(registry.lookup(key)).toBeUndefined();
    }
  });

  it("is independent of input order", () => {
    const v1 = manifest({ supportedVariants: ["COMMON"] });
    const v2 = manifest({ rendererKey: TEST_KEY_V2, supportedVariants: ["GROOM"] });
    const a = createRendererCompatibilityRegistry([v1, v2]);
    const b = createRendererCompatibilityRegistry([v2, v1]);
    expect(a.lookup(TEST_KEY_V1)).toEqual(b.lookup(TEST_KEY_V1));
    expect(a.lookup(TEST_KEY_V2)).toEqual(b.lookup(TEST_KEY_V2));
  });

  it("allows an empty registry in which every lookup misses", () => {
    expect(createRendererCompatibilityRegistry([]).lookup(TEST_KEY_V1)).toBeUndefined();
  });

  it("rejects a duplicate rendererKey with an invariant error (no first/last-write-wins)", () => {
    expectInvariant([manifest({ supportedVariants: ["COMMON"] }), manifest({ supportedVariants: ["BRIDE"] })]);
  });

  it("rejects a non-array manifest collection", () => {
    expect(() =>
      createRendererCompatibilityRegistry({} as unknown as RendererCompatibilityManifestV1[]),
    ).toThrow(RendererSelectionInvariantError);
  });

  it("accepts deep-frozen manifest inputs", () => {
    const frozen = manifest();
    Object.freeze(frozen.supportedVariants);
    Object.freeze(frozen.supportedPayloadSchemaVersions);
    Object.freeze(frozen.sectionCapabilities);
    Object.freeze(frozen);
    expect(createRendererCompatibilityRegistry([frozen]).lookup(TEST_KEY_V1)).toEqual(manifest());
  });
});

describe("createRendererCompatibilityRegistry — malformed manifests fail closed (R3, R14)", () => {
  it("rejects a non-object manifest", () => {
    for (const bad of [null, undefined, "x", 1, []]) {
      expectInvariant([bad as unknown as RendererCompatibilityManifestV1]);
    }
  });

  it("rejects an empty or non-string rendererKey without trimming", () => {
    expectInvariant([manifest({ rendererKey: "" })]);
    expectInvariant([malformed((m) => (m.rendererKey = 1))]);
    expectInvariant([malformed((m) => delete m.rendererKey)]);
    // Whitespace is not trimmed or normalized: it is simply a distinct exact key.
    const registry = createRendererCompatibilityRegistry([manifest({ rendererKey: " " })]);
    expect(registry.lookup(" ")?.rendererKey).toBe(" ");
    expect(registry.lookup("")).toBeUndefined();
  });

  it("rejects an inherited (non-own) required field", () => {
    const proto = manifest();
    const inherited = Object.create(proto) as Record<string, unknown>;
    inherited.rendererKey = TEST_KEY_V1;
    expectInvariant([inherited as unknown as RendererCompatibilityManifestV1]);
  });

  it("rejects extra top-level keys instead of silently projecting them away", () => {
    expectInvariant([malformed((m) => (m.name = "Sentinel Template"))]);
    expectInvariant([malformed((m) => (m.component = () => null))]);
    expectInvariant([malformed((m) => (m.supportedFeatures = ["rsvp"]))]);
  });

  it("rejects an empty supportedPayloadSchemaVersions list", () => {
    expectInvariant([manifest({ supportedPayloadSchemaVersions: [] })]);
  });

  it("rejects duplicate schema versions without deduplicating", () => {
    expectInvariant([manifest({ supportedPayloadSchemaVersions: [1, 1] })]);
  });

  it("rejects a non-canonical runtime schema version as malformed (not as merely unsupported)", () => {
    for (const bad of [2, 0, "1", 1.5, null]) {
      expectInvariant([malformed((m) => (m.supportedPayloadSchemaVersions = [1, bad]))]);
      expectInvariant([malformed((m) => (m.supportedPayloadSchemaVersions = [bad]))]);
    }
    expectInvariant([malformed((m) => (m.supportedPayloadSchemaVersions = 1))]);
  });

  it("rejects an empty supportedVariants list", () => {
    expectInvariant([manifest({ supportedVariants: [] })]);
  });

  it("rejects duplicate variants without deduplicating", () => {
    expectInvariant([manifest({ supportedVariants: ["COMMON", "COMMON"] })]);
  });

  it("rejects a non-canonical runtime variant", () => {
    for (const bad of ["common", "BOTH", "", null, 1]) {
      expectInvariant([malformed((m) => (m.supportedVariants = ["COMMON", bad]))]);
    }
    expectInvariant([malformed((m) => (m.supportedVariants = "COMMON"))]);
  });

  it("rejects sectionCapabilities with a missing key", () => {
    for (const key of RENDERER_SECTION_KEYS) {
      expectInvariant([
        malformed((m) => {
          const caps = { ...(m.sectionCapabilities as Record<string, boolean>) };
          delete caps[key];
          m.sectionCapabilities = caps;
        }),
      ]);
    }
  });

  it("rejects sectionCapabilities with an extra unknown key", () => {
    for (const extra of ["rsvp", "countdown", "map", "families", "heroLayout"]) {
      expectInvariant([
        malformed((m) => (m.sectionCapabilities = { ...(m.sectionCapabilities as object), [extra]: true })),
      ]);
    }
  });

  it("rejects a non-boolean capability value without coercion", () => {
    for (const bad of [1, 0, "true", null, undefined, {}]) {
      expectInvariant([
        malformed((m) => (m.sectionCapabilities = { ...(m.sectionCapabilities as object), gallery: bad })),
      ]);
    }
  });

  it("rejects non-object sectionCapabilities", () => {
    for (const bad of [null, true, [], "all"]) {
      expectInvariant([malformed((m) => (m.sectionCapabilities = bad))]);
    }
  });

  it("fails the whole registry when any single manifest is malformed", () => {
    expectInvariant([manifest({ rendererKey: TEST_KEY_V2 }), manifest({ supportedVariants: [] })]);
  });
});

describe("createRendererCompatibilityRegistry — ownership (R26)", () => {
  it("is unaffected by mutating the source manifest after creation", () => {
    const source = manifest({ supportedVariants: ["COMMON"] });
    const registry = createRendererCompatibilityRegistry([source]);

    (source as { rendererKey: string }).rendererKey = TEST_KEY_V2;
    (source.supportedVariants as string[]).push("BRIDE");
    (source.supportedPayloadSchemaVersions as number[]).push(2);
    (source.sectionCapabilities as { gallery: boolean }).gallery = false;

    expect(registry.lookup(TEST_KEY_V2)).toBeUndefined();
    expect(registry.lookup(TEST_KEY_V1)).toEqual(manifest({ supportedVariants: ["COMMON"] }));
  });

  it("stores deeply frozen registry-owned copies, not the source objects", () => {
    const source = manifest();
    const stored = createRendererCompatibilityRegistry([source]).lookup(TEST_KEY_V1)!;

    expect(stored).not.toBe(source);
    expect(stored.supportedVariants).not.toBe(source.supportedVariants);
    expect(stored.supportedPayloadSchemaVersions).not.toBe(source.supportedPayloadSchemaVersions);
    expect(stored.sectionCapabilities).not.toBe(source.sectionCapabilities);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored.supportedVariants)).toBe(true);
    expect(Object.isFrozen(stored.supportedPayloadSchemaVersions)).toBe(true);
    expect(Object.isFrozen(stored.sectionCapabilities)).toBe(true);
  });

  it("exposes only a frozen lookup surface", () => {
    const registry = createRendererCompatibilityRegistry([manifest()]);
    expect(Object.keys(registry)).toEqual(["lookup"]);
    expect(Object.isFrozen(registry)).toBe(true);
  });
});
