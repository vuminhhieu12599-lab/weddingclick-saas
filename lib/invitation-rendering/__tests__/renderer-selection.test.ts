import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { InvitationVariant } from "../../domain";
import type { InvitationViewModel } from "../invitation-view-model-types";
import {
  RENDERER_SECTION_KEYS,
  type RendererCompatibilityManifestV1,
  type RendererSectionKey,
} from "../renderer-compatibility-manifest";
import { createRendererCompatibilityRegistry, type RendererCompatibilityRegistry } from "../renderer-registry";
import { selectRendererCompatibility, type RendererSelectionContextV1 } from "../renderer-selection";
import {
  RendererSelectionError,
  RendererSelectionInvariantError,
  type RendererSelectionErrorCode,
} from "../renderer-selection-errors";
import type { SnapshotPayloadV1, SnapshotSections } from "../snapshot-payload-types";
import { deepFreeze } from "./invitation-view-model-fixtures";
import {
  ALL_AVAILABLE,
  ALL_CAPABLE,
  TEST_KEY_V1,
  TEST_KEY_V2,
  manifest,
  selectionSnapshot,
  viewModelFor,
  type SelectionSnapshotOptions,
} from "./renderer-selection-fixtures";

function pair(options: SelectionSnapshotOptions = {}): { snapshot: SnapshotPayloadV1; viewModel: InvitationViewModel } {
  const snapshot = selectionSnapshot(options);
  return { snapshot, viewModel: viewModelFor(snapshot) };
}

function select(
  options: SelectionSnapshotOptions = {},
  manifests: RendererCompatibilityManifestV1[] = [manifest()],
): RendererSelectionContextV1 {
  return selectRendererCompatibility({ ...pair(options), registry: createRendererCompatibilityRegistry(manifests) });
}

function capture(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected selection to throw");
}

function expectSelectionError(run: () => unknown, code: RendererSelectionErrorCode): void {
  const error = capture(run);
  expect(error).toBeInstanceOf(RendererSelectionError);
  expect((error as RendererSelectionError).code).toBe(code);
}

function expectInvariant(run: () => unknown, message?: RegExp): void {
  const error = capture(run);
  expect(error).toBeInstanceOf(RendererSelectionInvariantError);
  expect(error).not.toBeInstanceOf(RendererSelectionError);
  if (message) expect((error as Error).message).toMatch(message);
}

/** A registry whose lookup is observed, to prove when lookup does or does not happen. */
function spyRegistry(inner: RendererCompatibilityRegistry): RendererCompatibilityRegistry & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    lookup(rendererKey: string) {
      calls.push(rendererKey);
      return inner.lookup(rendererKey);
    },
  };
}

// ---------------------------------------------------------------------------
// Success and output shape
// ---------------------------------------------------------------------------

describe("selectRendererCompatibility — success context (R17)", () => {
  it("returns exactly rendererKey, compatibilityManifest and effectiveSections", () => {
    const context = select();
    expect(Object.keys(context).sort()).toEqual(["compatibilityManifest", "effectiveSections", "rendererKey"]);
    expect(context.rendererKey).toBe(TEST_KEY_V1);
    expect(context.compatibilityManifest).toEqual(manifest());
    expect(context.effectiveSections).toEqual(ALL_AVAILABLE);
  });

  it("returns a compatibilityManifest with exactly the four frozen fields", () => {
    const { compatibilityManifest } = select();
    expect(Object.keys(compatibilityManifest).sort()).toEqual([
      "rendererKey",
      "sectionCapabilities",
      "supportedPayloadSchemaVersions",
      "supportedVariants",
    ]);
    expect(Object.keys(compatibilityManifest.sectionCapabilities)).toEqual([...RENDERER_SECTION_KEYS]);
  });

  it("returns effectiveSections with exactly the five reserved keys", () => {
    const context = select({ sectionSettings: { heroLayout: "split", rsvp: false, countdown: true } });
    expect(Object.keys(context.effectiveSections)).toEqual([...RENDERER_SECTION_KEYS]);
  });

  it("selects v1 only for v1 and v2 only for v2 (exact key)", () => {
    const manifests = [
      manifest({ rendererKey: TEST_KEY_V1, supportedVariants: ["COMMON"] }),
      manifest({ rendererKey: TEST_KEY_V2, supportedVariants: ["COMMON", "BRIDE"] }),
    ];
    expect(select({ rendererKey: TEST_KEY_V1 }, manifests).compatibilityManifest.supportedVariants).toEqual(["COMMON"]);
    expect(select({ rendererKey: TEST_KEY_V2 }, manifests).compatibilityManifest.supportedVariants).toEqual([
      "COMMON",
      "BRIDE",
    ]);
    expect(select({ rendererKey: TEST_KEY_V2 }, manifests).rendererKey).toBe(TEST_KEY_V2);
  });

  it("gives the same result regardless of registry input order", () => {
    const a = manifest({ rendererKey: TEST_KEY_V1, sectionCapabilities: { ...ALL_CAPABLE, gift: false } });
    const b = manifest({ rendererKey: TEST_KEY_V2 });
    expect(select({}, [a, b])).toEqual(select({}, [b, a]));
    expect(select({ rendererKey: TEST_KEY_V2 }, [a, b])).toEqual(select({ rendererKey: TEST_KEY_V2 }, [b, a]));
  });
});

// ---------------------------------------------------------------------------
// Snapshot / ViewModel consistency (R18)
// ---------------------------------------------------------------------------

describe("selectRendererCompatibility — Snapshot/ViewModel consistency invariants (R18)", () => {
  it("throws an invariant error on rendererKey mismatch, before lookup", () => {
    const { snapshot, viewModel } = pair();
    const registry = spyRegistry(createRendererCompatibilityRegistry([manifest()]));
    const mismatched = { ...viewModel, template: { ...viewModel.template, rendererKey: TEST_KEY_V2 } };
    expectInvariant(() => selectRendererCompatibility({ snapshot, viewModel: mismatched, registry }), /rendererKey/);
    expect(registry.calls).toEqual([]);
  });

  it("throws an invariant error on variant mismatch, before lookup", () => {
    const { snapshot, viewModel } = pair({ variant: "COMMON" });
    const registry = spyRegistry(createRendererCompatibilityRegistry([manifest()]));
    const mismatched = { ...viewModel, variant: "GROOM" as const };
    expectInvariant(() => selectRendererCompatibility({ snapshot, viewModel: mismatched, registry }), /variant/);
    expect(registry.calls).toEqual([]);
  });

  it("throws an invariant error on templateVersionId mismatch, before lookup", () => {
    const { snapshot, viewModel } = pair();
    const registry = spyRegistry(createRendererCompatibilityRegistry([manifest()]));
    const mismatched = { ...viewModel, template: { ...viewModel.template, templateVersionId: "tv-other" } };
    expectInvariant(
      () => selectRendererCompatibility({ snapshot, viewModel: mismatched, registry }),
      /templateVersionId/,
    );
    expect(registry.calls).toEqual([]);
  });

  it("never reconciles: neither the Snapshot nor the ViewModel side wins", () => {
    // Both sides are individually registered; only disagreement matters.
    const { snapshot } = pair({ rendererKey: TEST_KEY_V1 });
    const { viewModel } = pair({ rendererKey: TEST_KEY_V2 });
    const registry = createRendererCompatibilityRegistry([manifest(), manifest({ rendererKey: TEST_KEY_V2 })]);
    expectInvariant(() => selectRendererCompatibility({ snapshot, viewModel, registry }));
  });

  it("treats an empty/non-string or non-canonical Snapshot identity as an invariant", () => {
    const registry = createRendererCompatibilityRegistry([manifest()]);
    const { snapshot, viewModel } = pair();
    const emptyKey = { ...snapshot, template: { ...snapshot.template, rendererKey: "" } };
    const emptyVmKey = { ...viewModel, template: { ...viewModel.template, rendererKey: "" } };
    expectInvariant(() => selectRendererCompatibility({ snapshot: emptyKey, viewModel: emptyVmKey, registry }));

    const badVariant = { ...snapshot, variant: "BOTH" } as unknown as SnapshotPayloadV1;
    const badVmVariant = { ...viewModel, variant: "BOTH" } as unknown as InvitationViewModel;
    expectInvariant(() => selectRendererCompatibility({ snapshot: badVariant, viewModel: badVmVariant, registry }));
  });
});

// ---------------------------------------------------------------------------
// Normal compatibility errors
// ---------------------------------------------------------------------------

describe("selectRendererCompatibility — exact lookup (R4)", () => {
  it("throws RENDERER_KEY_NOT_REGISTERED for an unknown exact key, with no fallback", () => {
    expectSelectionError(() => select({ rendererKey: "test.renderer.v3" }), "RENDERER_KEY_NOT_REGISTERED");
    expectSelectionError(() => select({ rendererKey: "test.renderer" }), "RENDERER_KEY_NOT_REGISTERED");
    expectSelectionError(() => select({ rendererKey: "TEST.RENDERER.V1" }), "RENDERER_KEY_NOT_REGISTERED");
    expectSelectionError(() => select({ rendererKey: `${TEST_KEY_V1} ` }), "RENDERER_KEY_NOT_REGISTERED");
  });

  it("does not fall back to the only/first registered renderer", () => {
    expectSelectionError(() => select({ rendererKey: TEST_KEY_V2 }, [manifest()]), "RENDERER_KEY_NOT_REGISTERED");
    expectSelectionError(() => select({}, []), "RENDERER_KEY_NOT_REGISTERED");
  });
});

describe("selectRendererCompatibility — payload schema compatibility (R5, R16)", () => {
  it("accepts snapshot payloadSchemaVersion 1 when the manifest lists [1]", () => {
    expect(select({}, [manifest({ supportedPayloadSchemaVersions: [1] })]).rendererKey).toBe(TEST_KEY_V1);
  });

  it("throws PAYLOAD_SCHEMA_VERSION_UNSUPPORTED when the Snapshot version is not listed", () => {
    const { snapshot, viewModel } = pair();
    const future = { ...snapshot, payloadSchemaVersion: 2 } as unknown as SnapshotPayloadV1;
    const registry = createRendererCompatibilityRegistry([manifest()]);
    expectSelectionError(
      () => selectRendererCompatibility({ snapshot: future, viewModel, registry }),
      "PAYLOAD_SCHEMA_VERSION_UNSUPPORTED",
    );
    const stringy = { ...snapshot, payloadSchemaVersion: "1" } as unknown as SnapshotPayloadV1;
    expectSelectionError(
      () => selectRendererCompatibility({ snapshot: stringy, viewModel, registry }),
      "PAYLOAD_SCHEMA_VERSION_UNSUPPORTED",
    );
  });

  it("reads payloadSchemaVersion only from the Snapshot, never the ViewModel", () => {
    const { snapshot, viewModel } = pair();
    expect("payloadSchemaVersion" in viewModel).toBe(false);
    const decorated = { ...viewModel, payloadSchemaVersion: 2 } as unknown as InvitationViewModel;
    const registry = createRendererCompatibilityRegistry([manifest()]);
    expect(selectRendererCompatibility({ snapshot, viewModel: decorated, registry }).rendererKey).toBe(TEST_KEY_V1);
  });
});

describe("selectRendererCompatibility — variant compatibility (R6)", () => {
  const variants: InvitationVariant[] = ["COMMON", "GROOM", "BRIDE"];

  it("with a COMMON-only manifest: COMMON succeeds, GROOM and BRIDE fail with no substitution", () => {
    const commonOnly = [manifest({ supportedVariants: ["COMMON"] })];
    expect(select({ variant: "COMMON" }, commonOnly).rendererKey).toBe(TEST_KEY_V1);
    expectSelectionError(() => select({ variant: "GROOM" }, commonOnly), "VARIANT_UNSUPPORTED");
    expectSelectionError(() => select({ variant: "BRIDE" }, commonOnly), "VARIANT_UNSUPPORTED");
  });

  it("with a multi-variant manifest: exactly the listed variants succeed", () => {
    const groomBride = [manifest({ supportedVariants: ["GROOM", "BRIDE"] })];
    expect(select({ variant: "GROOM" }, groomBride).rendererKey).toBe(TEST_KEY_V1);
    expect(select({ variant: "BRIDE" }, groomBride).rendererKey).toBe(TEST_KEY_V1);
    expectSelectionError(() => select({ variant: "COMMON" }, groomBride), "VARIANT_UNSUPPORTED");
  });

  it("with an all-variant manifest: every variant succeeds", () => {
    for (const variant of variants) {
      expect(select({ variant }).rendererKey).toBe(TEST_KEY_V1);
    }
  });
});

describe("selectRendererCompatibility — reserved section setting validation (R10)", () => {
  const invalidValues: unknown[] = ["true", "false", "", 1, 0, null, {}, []];

  it("throws INVALID_SECTION_SETTING_VALUE for any non-boolean reserved value, with no coercion", () => {
    for (const key of RENDERER_SECTION_KEYS) {
      for (const value of invalidValues) {
        const { snapshot, viewModel } = pair();
        const bad = {
          ...viewModel,
          design: { ...viewModel.design, sectionSettings: { [key]: value } },
        } as unknown as InvitationViewModel;
        const registry = createRendererCompatibilityRegistry([manifest()]);
        expectSelectionError(
          () => selectRendererCompatibility({ snapshot, viewModel: bad, registry }),
          "INVALID_SECTION_SETTING_VALUE",
        );
      }
    }
  });

  it("also rejects a non-boolean reserved value that could never create content", () => {
    expectSelectionError(
      () =>
        select({ sections: { ...ALL_AVAILABLE, gallery: false }, sectionSettings: { gallery: "yes" } }, [
          manifest({ sectionCapabilities: { ...ALL_CAPABLE, gallery: false } }),
        ]),
      "INVALID_SECTION_SETTING_VALUE",
    );
  });

  it("uses own-property semantics: inherited reserved keys are neither validated nor applied", () => {
    const { snapshot, viewModel } = pair();
    const inherited = Object.create({ gallery: false, music: "nope" }) as Record<string, boolean>;
    const vm = { ...viewModel, design: { ...viewModel.design, sectionSettings: inherited } };
    const registry = createRendererCompatibilityRegistry([manifest()]);
    const context = selectRendererCompatibility({ snapshot, viewModel: vm, registry });
    expect(context.effectiveSections).toEqual(ALL_AVAILABLE);
  });

  it("treats non-object sectionSettings as an invariant", () => {
    const { snapshot, viewModel } = pair();
    const registry = createRendererCompatibilityRegistry([manifest()]);
    for (const bad of [null, [], "gallery"]) {
      const vm = { ...viewModel, design: { ...viewModel.design, sectionSettings: bad } } as unknown as InvitationViewModel;
      expectInvariant(() => selectRendererCompatibility({ snapshot, viewModel: vm, registry }));
    }
  });
});

// ---------------------------------------------------------------------------
// Fail-fast order (R19)
// ---------------------------------------------------------------------------

describe("selectRendererCompatibility — frozen fail-fast order (R19)", () => {
  it("A: Snapshot/ViewModel mismatch + unknown rendererKey → mismatch invariant first", () => {
    const { snapshot, viewModel } = pair({ rendererKey: "test.unknown.v1" });
    const mismatched = { ...viewModel, template: { ...viewModel.template, templateVersionId: "tv-other" } };
    const registry = spyRegistry(createRendererCompatibilityRegistry([manifest()]));
    expectInvariant(() => selectRendererCompatibility({ snapshot, viewModel: mismatched, registry }));
    expect(registry.calls).toEqual([]);
  });

  it("B: unknown rendererKey + unsupported variant → unknown renderer key", () => {
    expectSelectionError(
      () => select({ rendererKey: TEST_KEY_V2, variant: "BRIDE" }, [manifest({ supportedVariants: ["COMMON"] })]),
      "RENDERER_KEY_NOT_REGISTERED",
    );
  });

  it("C: registered + unsupported schema + unsupported variant → schema error", () => {
    const { snapshot, viewModel } = pair({ variant: "BRIDE" });
    const future = { ...snapshot, payloadSchemaVersion: 2 } as unknown as SnapshotPayloadV1;
    const registry = createRendererCompatibilityRegistry([manifest({ supportedVariants: ["COMMON"] })]);
    expectSelectionError(
      () => selectRendererCompatibility({ snapshot: future, viewModel, registry }),
      "PAYLOAD_SCHEMA_VERSION_UNSUPPORTED",
    );
  });

  it("D: schema supported + variant unsupported + invalid reserved setting → variant error", () => {
    const { snapshot, viewModel } = pair({ variant: "GROOM" });
    const bad = {
      ...viewModel,
      design: { ...viewModel.design, sectionSettings: { gallery: "off" } },
    } as unknown as InvitationViewModel;
    const registry = createRendererCompatibilityRegistry([manifest({ supportedVariants: ["COMMON"] })]);
    expectSelectionError(
      () => selectRendererCompatibility({ snapshot, viewModel: bad, registry }),
      "VARIANT_UNSUPPORTED",
    );
  });

  it("E: schema + variant supported + invalid reserved setting → invalid-setting error", () => {
    const { snapshot, viewModel } = pair();
    const bad = {
      ...viewModel,
      design: { ...viewModel.design, sectionSettings: { gift: 1 } },
    } as unknown as InvitationViewModel;
    const registry = createRendererCompatibilityRegistry([manifest()]);
    expectSelectionError(
      () => selectRendererCompatibility({ snapshot, viewModel: bad, registry }),
      "INVALID_SECTION_SETTING_VALUE",
    );
  });
});

// ---------------------------------------------------------------------------
// Defensive selected-manifest re-validation (step 2a)
// ---------------------------------------------------------------------------

describe("selectRendererCompatibility — defensive selected-manifest validation (R14, step 2a)", () => {
  /** A hand-built registry that bypasses construction validation, as runtime-mutated state would. */
  function rawRegistry(entry: unknown): RendererCompatibilityRegistry {
    return { lookup: (key) => (key === TEST_KEY_V1 ? (entry as RendererCompatibilityManifestV1) : undefined) };
  }

  function selectWith(entry: unknown, options: SelectionSnapshotOptions = {}): RendererSelectionContextV1 {
    return selectRendererCompatibility({ ...pair(options), registry: rawRegistry(entry) });
  }

  it("fails invariant for a malformed selected manifest before schema compatibility", () => {
    // Malformed schema list and an unsupported variant: the invariant wins over normal errors.
    const bad = { ...manifest({ supportedVariants: ["COMMON"] }), supportedPayloadSchemaVersions: [2] };
    expectInvariant(() => selectWith(bad, { variant: "BRIDE" }));
  });

  it("fails invariant for empty/duplicate lists, bad variants and malformed capabilities", () => {
    const base = manifest();
    const cases: unknown[] = [
      { ...base, supportedPayloadSchemaVersions: [] },
      { ...base, supportedPayloadSchemaVersions: [1, 1] },
      { ...base, supportedVariants: [] },
      { ...base, supportedVariants: ["COMMON", "COMMON"] },
      { ...base, supportedVariants: ["COMMON", "BOTH"] },
      { ...base, sectionCapabilities: { ...ALL_CAPABLE, rsvp: true } },
      { ...base, sectionCapabilities: { ...ALL_CAPABLE, gallery: "yes" } },
      { ...base, sectionCapabilities: { invitationMessage: true, loveStory: true, gallery: true, music: true } },
      { ...base, extra: "SENTINEL" },
      null,
    ];
    for (const entry of cases) expectInvariant(() => selectWith(entry));
  });

  it("fails invariant when the registry returns a manifest for a different key", () => {
    expectInvariant(() => selectWith(manifest({ rendererKey: TEST_KEY_V2 })), /Registry returned/);
  });

  it("does not return the registry-held object even from a hand-built registry", () => {
    const held = manifest();
    const context = selectWith(held);
    expect(context.compatibilityManifest).not.toBe(held);
    expect(context.compatibilityManifest).toEqual(held);
  });
});

// ---------------------------------------------------------------------------
// Effective visibility (R9)
// ---------------------------------------------------------------------------

describe("selectRendererCompatibility — effective visibility truth table (R9)", () => {
  const contents = [true, false];
  const capabilities = [true, false];
  const settings: Array<"absent" | true | false> = ["absent", true, false];

  function effective(
    key: RendererSectionKey,
    content: boolean,
    capability: boolean,
    setting: "absent" | boolean,
  ): boolean {
    return select(
      {
        sections: { ...ALL_AVAILABLE, [key]: content },
        sectionSettings: setting === "absent" ? {} : { [key]: setting },
      },
      [manifest({ sectionCapabilities: { ...ALL_CAPABLE, [key]: capability } })],
    ).effectiveSections[key];
  }

  it("matches content && capability && setting !== false for all 12 gallery combinations", () => {
    const rows: string[] = [];
    for (const content of contents) {
      for (const capability of capabilities) {
        for (const setting of settings) {
          const expected = content && capability && setting !== false;
          rows.push(`${content}/${capability}/${String(setting)}=${effective("gallery", content, capability, setting)}`);
          expect(effective("gallery", content, capability, setting)).toBe(expected);
        }
      }
    }
    expect(rows).toHaveLength(12);
  });

  it("matches the formula for every combination on all five keys", () => {
    for (const key of RENDERER_SECTION_KEYS) {
      for (const content of contents) {
        for (const capability of capabilities) {
          for (const setting of settings) {
            expect(effective(key, content, capability, setting)).toBe(content && capability && setting !== false);
          }
        }
      }
    }
  });

  it("setting true never creates absent content", () => {
    for (const key of RENDERER_SECTION_KEYS) {
      expect(effective(key, false, true, true)).toBe(false);
    }
  });

  it("capability false is a hard limit even with content and setting true", () => {
    for (const key of RENDERER_SECTION_KEYS) {
      expect(effective(key, true, false, true)).toBe(false);
      expect(effective(key, true, false, "absent")).toBe(false);
    }
  });

  it("setting false disables; absent setting means not disabled", () => {
    for (const key of RENDERER_SECTION_KEYS) {
      expect(effective(key, true, true, false)).toBe(false);
      expect(effective(key, true, true, "absent")).toBe(true);
    }
  });

  it("computes each key independently in one selection", () => {
    const context = select(
      {
        sections: { invitationMessage: true, loveStory: false, gallery: true, music: true, gift: true },
        sectionSettings: { invitationMessage: true, loveStory: true, music: false },
      },
      [manifest({ sectionCapabilities: { ...ALL_CAPABLE, gift: false } })],
    );
    expect(context.effectiveSections).toEqual({
      invitationMessage: true,
      loveStory: false,
      gallery: true,
      music: false,
      gift: false,
    });
  });

  it("treats a non-boolean ViewModel sections value as an invariant, never truthy", () => {
    const { snapshot, viewModel } = pair();
    const bad = { ...viewModel, sections: { ...viewModel.sections, gallery: "yes" } } as unknown as InvitationViewModel;
    const registry = createRendererCompatibilityRegistry([manifest()]);
    expectInvariant(() => selectRendererCompatibility({ snapshot, viewModel: bad, registry }));
  });
});

describe("selectRendererCompatibility — unknown sectionSettings keys (R10)", () => {
  it("ignores unknown keys of any type for visibility and does not reject them", () => {
    const unknown = { heroLayout: "split", customSpacing: 24, animationStyle: false, rsvp: false, countdown: "off" };
    const withUnknown = select({ sectionSettings: unknown });
    const without = select();
    expect(withUnknown.effectiveSections).toEqual(without.effectiveSections);
    expect(Object.keys(withUnknown.effectiveSections)).toEqual([...RENDERER_SECTION_KEYS]);
  });

  it("leaves unknown keys in the ViewModel untouched", () => {
    const { snapshot, viewModel } = pair({ sectionSettings: { heroLayout: "split", customSpacing: 24, gallery: true } });
    const before = structuredClone(viewModel);
    selectRendererCompatibility({ snapshot, viewModel, registry: createRendererCompatibilityRegistry([manifest()]) });
    expect(viewModel).toEqual(before);
    expect(viewModel.design.sectionSettings).toEqual({ heroLayout: "split", customSpacing: 24, gallery: true });
  });
});

describe("selectRendererCompatibility — media UNAVAILABLE has no visibility effect (R11)", () => {
  it("gives identical effectiveSections for all-RESOLVED and all-UNAVAILABLE ViewModels", () => {
    const snapshot = selectionSnapshot();
    const resolvedVm = viewModelFor(snapshot, "RESOLVED");
    const unavailableVm = viewModelFor(snapshot, "UNAVAILABLE");
    expect(resolvedVm.media.gallery.every((slot) => slot.status === "RESOLVED")).toBe(true);
    expect(unavailableVm.media.gallery.length).toBeGreaterThan(0);
    expect(unavailableVm.media.gallery.every((slot) => slot.status === "UNAVAILABLE")).toBe(true);
    expect(unavailableVm.media.audio?.status).toBe("UNAVAILABLE");

    const registry = createRendererCompatibilityRegistry([manifest()]);
    const a = selectRendererCompatibility({ snapshot, viewModel: resolvedVm, registry });
    const b = selectRendererCompatibility({ snapshot, viewModel: unavailableVm, registry });
    expect(b.effectiveSections).toEqual(a.effectiveSections);
    expect(b.effectiveSections.gallery).toBe(true);
    expect(b.effectiveSections.music).toBe(true);
    expect(b.effectiveSections.gift).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Leaks, ownership, immutability, determinism (R17, R26)
// ---------------------------------------------------------------------------

describe("selectRendererCompatibility — leak prevention", () => {
  it("does not leak runtime sentinel keys from Snapshot or ViewModel", () => {
    const { snapshot, viewModel } = pair();
    const decoratedSnapshot = {
      ...snapshot,
      SNAPSHOT_SENTINEL: "S",
      template: { ...snapshot.template, TEMPLATE_SENTINEL: "T" },
    } as unknown as SnapshotPayloadV1;
    const decoratedVm = {
      ...viewModel,
      VIEWMODEL_SENTINEL: "V",
      sections: { ...viewModel.sections, rsvp: true, SECTION_SENTINEL: true } as SnapshotSections,
    } as unknown as InvitationViewModel;
    const context = selectRendererCompatibility({
      snapshot: decoratedSnapshot,
      viewModel: decoratedVm,
      registry: createRendererCompatibilityRegistry([manifest()]),
    });
    const serialized = JSON.stringify(context);
    for (const sentinel of ["SNAPSHOT_SENTINEL", "TEMPLATE_SENTINEL", "VIEWMODEL_SENTINEL", "SECTION_SENTINEL", "rsvp"]) {
      expect(serialized).not.toContain(sentinel);
    }
    expect(Object.keys(context.effectiveSections)).toEqual([...RENDERER_SECTION_KEYS]);
  });

  it("does not expose manifest or array extras from the registry's stored data", () => {
    const context = select();
    expect(JSON.stringify(context.compatibilityManifest)).toBe(JSON.stringify(manifest()));
  });
});

describe("selectRendererCompatibility — output ownership (R26)", () => {
  it("returns a manifest copy that is not the registry-held object", () => {
    const registry = createRendererCompatibilityRegistry([manifest()]);
    const context = selectRendererCompatibility({ ...pair(), registry });
    const held = registry.lookup(TEST_KEY_V1)!;
    expect(context.compatibilityManifest).not.toBe(held);
    expect(context.compatibilityManifest.supportedVariants).not.toBe(held.supportedVariants);
    expect(context.compatibilityManifest.supportedPayloadSchemaVersions).not.toBe(held.supportedPayloadSchemaVersions);
    expect(context.compatibilityManifest.sectionCapabilities).not.toBe(held.sectionCapabilities);
  });

  it("mutating the returned context never changes the registry or later selections", () => {
    const source = manifest({ supportedVariants: ["COMMON"] });
    const sourceBefore = structuredClone(source);
    const registry = createRendererCompatibilityRegistry([source]);
    const first = selectRendererCompatibility({ ...pair(), registry });

    (first.compatibilityManifest.supportedVariants as string[]).push("BRIDE");
    (first.compatibilityManifest.supportedPayloadSchemaVersions as number[]).push(2);
    (first.compatibilityManifest.sectionCapabilities as { gallery: boolean }).gallery = false;
    (first.compatibilityManifest as { rendererKey: string }).rendererKey = TEST_KEY_V2;
    first.effectiveSections.gallery = false;
    first.effectiveSections.gift = false;

    expect(registry.lookup(TEST_KEY_V1)).toEqual(sourceBefore);
    expect(source).toEqual(sourceBefore);
    const second = selectRendererCompatibility({ ...pair(), registry });
    expect(second.compatibilityManifest).toEqual(sourceBefore);
    expect(second.effectiveSections).toEqual(ALL_AVAILABLE);
    expectSelectionError(
      () => selectRendererCompatibility({ ...pair({ variant: "BRIDE" }), registry }),
      "VARIANT_UNSUPPORTED",
    );
  });

  it("returns fresh effectiveSections objects per selection", () => {
    const registry = createRendererCompatibilityRegistry([manifest()]);
    const inputs = pair();
    const a = selectRendererCompatibility({ ...inputs, registry });
    const b = selectRendererCompatibility({ ...inputs, registry });
    expect(a.effectiveSections).not.toBe(b.effectiveSections);
    expect(a.effectiveSections).not.toBe(inputs.viewModel.sections);
    expect(a.compatibilityManifest).not.toBe(b.compatibilityManifest);
  });
});

describe("selectRendererCompatibility — input immutability and determinism (R26)", () => {
  it("works on deep-frozen Snapshot, ViewModel and manifest inputs without mutating them", () => {
    const { snapshot, viewModel } = pair({ sectionSettings: { gallery: false, heroLayout: "split" } });
    const source = manifest({ sectionCapabilities: { ...ALL_CAPABLE, music: false } });
    const before = structuredClone({ snapshot, viewModel, source });
    deepFreeze(snapshot);
    deepFreeze(viewModel);
    deepFreeze(source);

    const context = selectRendererCompatibility({
      snapshot,
      viewModel,
      registry: createRendererCompatibilityRegistry([source]),
    });

    expect(context.effectiveSections).toEqual({ ...ALL_AVAILABLE, gallery: false, music: false });
    expect({ snapshot, viewModel, source }).toEqual(before);
  });

  it("returns semantically equal results for equal inputs built independently", () => {
    const run = () =>
      select({ variant: "GROOM", sectionSettings: { loveStory: false, heroLayout: "stack" } }, [
        manifest({ rendererKey: TEST_KEY_V2 }),
        manifest({ sectionCapabilities: { ...ALL_CAPABLE, gift: false } }),
      ]);
    expect(run()).toEqual(run());
  });
});

// ---------------------------------------------------------------------------
// Static boundaries (R2, R15, R22, R25)
// ---------------------------------------------------------------------------

describe("RF-04 production sources — static boundaries", () => {
  const files = [
    "renderer-compatibility-manifest.ts",
    "renderer-registry.ts",
    "renderer-selection.ts",
    "renderer-selection-errors.ts",
  ];
  const sources = files.map((file) => readFileSync(join(__dirname, "..", file), "utf8"));

  it("contain no production renderer key, prototype reference or DB manifest dependency", () => {
    for (const source of sources) {
      for (const forbidden of [
        "wedding.elegant-editorial",
        "Elegant Editorial",
        "GreenIvoryEditorialPrototype",
        "app/internal/prototypes",
        "TemplateDesignManifestV1",
        "template_versions",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it("contain no I/O, environment, clock, randomness or renderer implementation", () => {
    for (const source of sources) {
      for (const forbidden of [
        "supabase",
        "service_role",
        "fetch(",
        "process.env",
        "window",
        "document",
        "navigator",
        "localStorage",
        "sessionStorage",
        "Date.now",
        "new Date",
        "performance.now",
        "Math.random",
        "React",
        "ComponentType",
        "render(",
        "localeCompare",
        "async ",
        "await ",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
});
