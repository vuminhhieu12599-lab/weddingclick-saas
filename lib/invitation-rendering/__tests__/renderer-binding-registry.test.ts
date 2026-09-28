import { Component, Fragment, createContext, forwardRef, lazy, memo } from "react";
import { describe, expect, it } from "vitest";

import * as publicApi from "../index";
import { RendererBindingInvariantError } from "../renderer-binding-errors";
import {
  createInvitationRendererBindingRegistry,
  resolveInvitationRendererComponent,
  type InvitationRendererBindingRegistryV1,
  type RendererBindingEntryV1,
} from "../renderer-binding-registry";
import type { RendererCompatibilityManifestV1 } from "../renderer-compatibility-manifest";
import type { InvitationRendererComponentV1, InvitationRendererPropsV1 } from "../renderer-component";
import type { RendererCompatibilityRegistry } from "../renderer-registry";
import { selectRendererCompatibility } from "../renderer-selection";
import { RendererSelectionError, RendererSelectionInvariantError } from "../renderer-selection-errors";
import { TEST_KEY_V1, TEST_KEY_V2, manifest, selectionSnapshot, viewModelFor } from "./renderer-selection-fixtures";

/**
 * RF-05B implementation-binding registry (docs/DECISIONS.md RF-05
 * clarification K9–K13, K36, K44). Test-only keys and fixture components;
 * no component is ever rendered, called or constructed.
 */

// ---------------------------------------------------------------------------
// Fixture components: every React 19 form assignable to InvitationRendererComponentV1
// ---------------------------------------------------------------------------

const FunctionRenderer: InvitationRendererComponentV1 = () => null;
const OtherFunctionRenderer: InvitationRendererComponentV1 = () => null;

class ClassRenderer extends Component<InvitationRendererPropsV1> {
  render() {
    return null;
  }
}

const MemoRenderer: InvitationRendererComponentV1 = memo(FunctionRenderer);
const MemoClassRenderer: InvitationRendererComponentV1 = memo(ClassRenderer);
const ForwardRefRenderer: InvitationRendererComponentV1 = forwardRef<HTMLDivElement, InvitationRendererPropsV1>(
  function ForwardRefRender() {
    return null;
  },
);
const MemoForwardRefRenderer: InvitationRendererComponentV1 = memo(
  forwardRef<HTMLDivElement, InvitationRendererPropsV1>(function MemoForwardRefRender() {
    return null;
  }),
);
const LazyRenderer: InvitationRendererComponentV1 = lazy(() => Promise.resolve({ default: FunctionRenderer }));

const VALID_COMPONENT_FORMS: readonly (readonly [string, InvitationRendererComponentV1])[] = [
  ["function component", FunctionRenderer],
  ["class component", ClassRenderer],
  ["memo(function)", MemoRenderer],
  ["memo(class)", MemoClassRenderer],
  ["forwardRef", ForwardRefRenderer],
  ["memo(forwardRef)", MemoForwardRefRenderer],
  ["lazy", LazyRenderer],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entry(
  component: InvitationRendererComponentV1 = FunctionRenderer,
  overrides: Partial<RendererCompatibilityManifestV1> = {},
): RendererBindingEntryV1 {
  return { compatibilityManifest: manifest(overrides), component };
}

/** Runtime-cast value that static types would reject. */
function cast<T>(value: unknown): T {
  return value as T;
}

function caught(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

function expectBindingInvariant(action: () => unknown): void {
  const error = caught(action);
  expect(error).toBeInstanceOf(RendererBindingInvariantError);
  expect(error).not.toBeInstanceOf(RendererSelectionInvariantError);
  expect(error).not.toBeInstanceOf(RendererSelectionError);
}

function expectRf04Invariant(action: () => unknown): void {
  const error = caught(action);
  expect(error).toBeInstanceOf(RendererSelectionInvariantError);
  expect(error).not.toBeInstanceOf(RendererBindingInvariantError);
}

function expectFactoryBindingInvariant(entries: unknown): void {
  expectBindingInvariant(() => createInvitationRendererBindingRegistry(cast(entries)));
}

function malformedManifest(mutate: (m: Record<string, unknown>) => void): RendererCompatibilityManifestV1 {
  const m = cast<Record<string, unknown>>(manifest());
  mutate(m);
  return cast(m);
}

function select(registry: InvitationRendererBindingRegistryV1, rendererKey: string = TEST_KEY_V1) {
  const snapshot = selectionSnapshot({ rendererKey });
  return selectRendererCompatibility({
    snapshot,
    viewModel: viewModelFor(snapshot),
    registry: registry.compatibilityRegistry,
  });
}

/** A valid compatibility registry that holds exactly one manifest per key. */
function compatibilityRegistryWith(manifests: Record<string, unknown>): RendererCompatibilityRegistry {
  return { lookup: (key) => cast(manifests[key]) };
}

function handBuilt(
  compatibility: Record<string, unknown>,
  components: Record<string, unknown>,
): InvitationRendererBindingRegistryV1 {
  return {
    compatibilityRegistry: compatibilityRegistryWith(compatibility),
    lookupComponent: (key) => cast(components[key]),
  };
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

describe("RF-05B public exports", () => {
  it("exports the error, factory and resolver, and no internal helper", () => {
    expect(publicApi.RendererBindingInvariantError).toBe(RendererBindingInvariantError);
    expect(publicApi.createInvitationRendererBindingRegistry).toBe(createInvitationRendererBindingRegistry);
    expect(publicApi.resolveInvitationRendererComponent).toBe(resolveInvitationRendererComponent);
    expect(Object.keys(publicApi).filter((name) => /binding|component/i.test(name)).sort()).toEqual([
      "RendererBindingInvariantError",
      "createInvitationRendererBindingRegistry",
      "resolveInvitationRendererComponent",
    ]);
    expect(Object.keys(publicApi)).not.toContain("projectCompatibilityManifest");
  });

  it("RendererBindingInvariantError follows the invariant-error convention", () => {
    const error = new RendererBindingInvariantError("boom");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("RendererBindingInvariantError");
    expect(error.message).toBe("boom");
    expect(error).not.toHaveProperty("code");
  });
});

// ---------------------------------------------------------------------------
// Factory: construction, component forms, entry shape
// ---------------------------------------------------------------------------

describe("createInvitationRendererBindingRegistry — component forms (K9, K12)", () => {
  it.each(VALID_COMPONENT_FORMS)("accepts a %s and returns the exact bound reference", (_label, component) => {
    const registry = createInvitationRendererBindingRegistry([entry(component)]);
    expect(registry.lookupComponent(TEST_KEY_V1)).toBe(component);
    expect(resolveInvitationRendererComponent(registry, TEST_KEY_V1)).toBe(component);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["string", "component"],
    ["number", 123],
    ["boolean", true],
    ["array", []],
    ["plain object", {}],
    ["random $$typeof symbol", { $$typeof: Symbol("random") }],
    ["random registry $$typeof symbol", { $$typeof: Symbol.for("react.random") }],
    ["string $$typeof marker", { $$typeof: "react.memo", type: FunctionRenderer }],
    ["element marker", { $$typeof: Symbol.for("react.transitional.element"), type: FunctionRenderer }],
    ["context object", createContext(null)],
    ["Fragment", Fragment],
    ["memo marker without type", { $$typeof: Symbol.for("react.memo") }],
    ["memo marker wrapping a non-component", { $$typeof: Symbol.for("react.memo"), type: {} }],
    ["memo marker wrapping a random symbol object", { $$typeof: Symbol.for("react.memo"), type: { $$typeof: Symbol("x") } }],
    ["forwardRef marker without render", { $$typeof: Symbol.for("react.forward_ref") }],
    ["forwardRef marker with non-function render", { $$typeof: Symbol.for("react.forward_ref"), render: {} }],
  ])("rejects a %s component", (_label, component) => {
    expectFactoryBindingInvariant([{ compatibilityManifest: manifest(), component }]);
  });

  it("rejects a self-referencing memo object without looping", () => {
    const cyclic: Record<string, unknown> = { $$typeof: Symbol.for("react.memo") };
    cyclic.type = cyclic;
    expectFactoryBindingInvariant([{ compatibilityManifest: manifest(), component: cyclic }]);
  });

  it("never calls or constructs the component", () => {
    let calls = 0;
    const Spy: InvitationRendererComponentV1 = () => {
      calls += 1;
      return null;
    };
    const registry = createInvitationRendererBindingRegistry([entry(Spy)]);
    resolveInvitationRendererComponent(registry, TEST_KEY_V1);
    expect(calls).toBe(0);
  });
});

describe("createInvitationRendererBindingRegistry — entries and entry shape (K9, K12)", () => {
  it.each([null, undefined, {}, "entries", 1, { length: 1, 0: entry() }])(
    "rejects a non-array entries collection (%s)",
    (entries) => {
      expectFactoryBindingInvariant(entries);
    },
  );

  it("rejects a sparse-array hole", () => {
    const entries: RendererBindingEntryV1[] = [];
    entries[1] = entry();
    expectFactoryBindingInvariant(entries);
  });

  it.each([
    ["null", null],
    ["array", [manifest(), FunctionRenderer]],
    ["string", "entry"],
    ["number", 7],
    ["missing component", { compatibilityManifest: manifest() }],
    ["missing compatibilityManifest", { component: FunctionRenderer }],
    ["extra rendererKey", { rendererKey: TEST_KEY_V1, compatibilityManifest: manifest(), component: FunctionRenderer }],
    ["unknown extra key", { compatibilityManifest: manifest(), component: FunctionRenderer, fallback: FunctionRenderer }],
    ["extra symbol key", { compatibilityManifest: manifest(), component: FunctionRenderer, [Symbol("x")]: 1 }],
    [
      "inherited substitute properties",
      Object.create({ compatibilityManifest: manifest(), component: FunctionRenderer }) as unknown,
    ],
    [
      "one own and one inherited property",
      Object.assign(Object.create({ component: FunctionRenderer }) as object, { compatibilityManifest: manifest() }),
    ],
  ])("rejects an entry that is %s", (_label, bad) => {
    expectFactoryBindingInvariant([bad]);
  });

  it("does not normalize a component-less entry into a fallback", () => {
    expectFactoryBindingInvariant([{ compatibilityManifest: manifest(), component: undefined }]);
  });
});

// ---------------------------------------------------------------------------
// RF-04 projection reuse and error propagation
// ---------------------------------------------------------------------------

describe("createInvitationRendererBindingRegistry — RF-04 manifest errors propagate unchanged (K12)", () => {
  it.each([
    ["null manifest", null],
    ["array manifest", [] as unknown],
    ["empty rendererKey", malformedManifest((m) => (m.rendererKey = ""))],
    ["non-string rendererKey", malformedManifest((m) => (m.rendererKey = 1))],
    ["missing supportedVariants", malformedManifest((m) => delete m.supportedVariants)],
    ["unknown manifest key", malformedManifest((m) => (m.displayName = "Test"))],
    ["duplicate variant", malformedManifest((m) => (m.supportedVariants = ["COMMON", "COMMON"]))],
    ["non-canonical variant", malformedManifest((m) => (m.supportedVariants = ["MAYBE"]))],
    ["empty payload versions", malformedManifest((m) => (m.supportedPayloadSchemaVersions = []))],
    [
      "non-boolean section capability",
      malformedManifest((m) => (m.sectionCapabilities = { ...manifest().sectionCapabilities, gift: "yes" })),
    ],
  ])("%s throws RendererSelectionInvariantError", (_label, bad) => {
    expectRf04Invariant(() =>
      createInvitationRendererBindingRegistry([{ compatibilityManifest: cast(bad), component: FunctionRenderer }]),
    );
  });
});

describe("createInvitationRendererBindingRegistry — deterministic fail-fast order", () => {
  const badManifest = malformedManifest((m) => delete m.supportedVariants);

  it("checks entry shape before the manifest", () => {
    expectFactoryBindingInvariant([{ compatibilityManifest: badManifest, component: FunctionRenderer, extra: 1 }]);
  });

  it("checks the component before the manifest", () => {
    expectFactoryBindingInvariant([{ compatibilityManifest: badManifest, component: {} }]);
  });

  it("checks entries in input order", () => {
    expectRf04Invariant(() =>
      createInvitationRendererBindingRegistry([
        entry(),
        { compatibilityManifest: badManifest, component: FunctionRenderer },
        cast({ compatibilityManifest: manifest(), component: null }),
      ]),
    );
    expectFactoryBindingInvariant([
      entry(),
      { compatibilityManifest: manifest(), component: null },
      { compatibilityManifest: badManifest, component: FunctionRenderer },
    ]);
  });

  it("an earlier duplicate wins over a later malformed manifest, and vice versa", () => {
    expectFactoryBindingInvariant([entry(), entry(), { compatibilityManifest: badManifest, component: FunctionRenderer }]);
    expectRf04Invariant(() =>
      createInvitationRendererBindingRegistry([
        entry(),
        { compatibilityManifest: badManifest, component: FunctionRenderer },
        entry(),
      ]),
    );
  });
});

describe("createInvitationRendererBindingRegistry — duplicate binding keys (K11, K12)", () => {
  it.each([
    ["the same component", [entry(FunctionRenderer), entry(FunctionRenderer)]],
    ["different components", [entry(FunctionRenderer), entry(ClassRenderer)]],
    ["different components, reversed order", [entry(ClassRenderer), entry(FunctionRenderer)]],
    [
      "different manifests for the same key",
      [entry(FunctionRenderer, { supportedVariants: ["COMMON"] }), entry(OtherFunctionRenderer, { supportedVariants: ["BRIDE"] })],
    ],
    ["a duplicate among other keys", [entry(), entry(ClassRenderer, { rendererKey: TEST_KEY_V2 }), entry(MemoRenderer)]],
  ])("throws RendererBindingInvariantError for %s", (_label, entries) => {
    const error = caught(() => createInvitationRendererBindingRegistry(entries));
    expect(error).toBeInstanceOf(RendererBindingInvariantError);
    expect(error).not.toBeInstanceOf(RendererSelectionInvariantError);
    expect((error as Error).message).toContain(TEST_KEY_V1);
  });
});

// ---------------------------------------------------------------------------
// Registry facade, exact lookup, ownership
// ---------------------------------------------------------------------------

describe("binding registry facade (K10, K11)", () => {
  it("is frozen and exposes only compatibilityRegistry and lookupComponent", () => {
    const registry = createInvitationRendererBindingRegistry([entry()]);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Reflect.ownKeys(registry).sort()).toEqual(["compatibilityRegistry", "lookupComponent"]);
    expect(Object.values(registry).some((value) => value instanceof Map || Array.isArray(value))).toBe(false);
    expect(Object.isFrozen(registry.compatibilityRegistry)).toBe(true);
    expect(() => {
      (registry as unknown as Record<string, unknown>).lookupComponent = () => ClassRenderer;
    }).toThrow(TypeError);
    expect(registry.lookupComponent(TEST_KEY_V1)).toBe(FunctionRenderer);
  });

  it("builds the RF-04 compatibility registry from exactly the bound manifests", () => {
    const v1 = manifest({ supportedVariants: ["COMMON"] });
    const v2 = manifest({ rendererKey: TEST_KEY_V2, supportedVariants: ["BRIDE"] });
    const registry = createInvitationRendererBindingRegistry([
      { compatibilityManifest: v1, component: FunctionRenderer },
      { compatibilityManifest: v2, component: ClassRenderer },
    ]);
    expect(registry.compatibilityRegistry.lookup(TEST_KEY_V1)).toEqual(v1);
    expect(registry.compatibilityRegistry.lookup(TEST_KEY_V2)).toEqual(v2);
    expect(registry.lookupComponent(TEST_KEY_V1)).toBe(FunctionRenderer);
    expect(registry.lookupComponent(TEST_KEY_V2)).toBe(ClassRenderer);
  });

  it("does no prefix, version-family, case or whitespace matching", () => {
    const registry = createInvitationRendererBindingRegistry([
      entry(FunctionRenderer),
      entry(ClassRenderer, { rendererKey: TEST_KEY_V2 }),
    ]);
    for (const key of [
      "test.renderer",
      "test.renderer.v",
      "test.renderer.v10",
      "TEST.RENDERER.V1",
      ` ${TEST_KEY_V1}`,
      `${TEST_KEY_V1} `,
      "",
    ]) {
      expect(registry.lookupComponent(key)).toBeUndefined();
      expect(registry.compatibilityRegistry.lookup(key)).toBeUndefined();
      expectBindingInvariant(() => resolveInvitationRendererComponent(registry, key));
    }
  });

  it("has no fallback: an unbound key never resolves to another renderer", () => {
    const registry = createInvitationRendererBindingRegistry([entry()]);
    expect(registry.lookupComponent(TEST_KEY_V2)).toBeUndefined();
    expectBindingInvariant(() => resolveInvitationRendererComponent(registry, TEST_KEY_V2));
  });

  it("an empty entries array is legal and binds nothing", () => {
    const registry = createInvitationRendererBindingRegistry([]);
    expect(registry.lookupComponent(TEST_KEY_V1)).toBeUndefined();
    expect(registry.compatibilityRegistry.lookup(TEST_KEY_V1)).toBeUndefined();
    const error = caught(() => select(registry));
    expect(error).toBeInstanceOf(RendererSelectionError);
    expect((error as RendererSelectionError).code).toBe("RENDERER_KEY_NOT_REGISTERED");
  });
});

describe("binding registry ownership (K10)", () => {
  it("is unaffected by later mutation of caller-owned entries, components and manifests", () => {
    const sourceManifest = manifest({ supportedVariants: ["COMMON", "GROOM"] });
    const sourceEntry: { compatibilityManifest: RendererCompatibilityManifestV1; component: InvitationRendererComponentV1 } = {
      compatibilityManifest: sourceManifest,
      component: FunctionRenderer,
    };
    const entries: RendererBindingEntryV1[] = [sourceEntry];
    const registry = createInvitationRendererBindingRegistry(entries);

    expect(Object.isFrozen(entries)).toBe(false);
    expect(Object.isFrozen(sourceEntry)).toBe(false);
    expect(Object.isFrozen(sourceManifest)).toBe(false);

    entries.push(entry(ClassRenderer, { rendererKey: TEST_KEY_V2 }));
    entries.splice(0, 1, entry(ClassRenderer));
    sourceEntry.component = ClassRenderer;
    const mutable = cast<Record<string, unknown>>(sourceManifest);
    mutable.rendererKey = TEST_KEY_V2;
    (sourceManifest.supportedVariants as string[]).push("BRIDE");
    (sourceManifest.supportedPayloadSchemaVersions as number[]).splice(0, 1);
    (sourceManifest.sectionCapabilities as Record<string, boolean>).gift = false;

    expect(registry.lookupComponent(TEST_KEY_V1)).toBe(FunctionRenderer);
    expect(registry.lookupComponent(TEST_KEY_V2)).toBeUndefined();
    expect(resolveInvitationRendererComponent(registry, TEST_KEY_V1)).toBe(FunctionRenderer);
    expect(registry.compatibilityRegistry.lookup(TEST_KEY_V1)).toEqual(
      manifest({ supportedVariants: ["COMMON", "GROOM"] }),
    );
    expect(registry.compatibilityRegistry.lookup(TEST_KEY_V2)).toBeUndefined();
    expect(select(registry).effectiveSections.gift).toBe(true);

    const brideSnapshot = selectionSnapshot({ variant: "BRIDE" });
    const error = caught(() =>
      selectRendererCompatibility({
        snapshot: brideSnapshot,
        viewModel: viewModelFor(brideSnapshot),
        registry: registry.compatibilityRegistry,
      }),
    );
    expect((error as RendererSelectionError).code).toBe("VARIANT_UNSUPPORTED");
  });
});

// ---------------------------------------------------------------------------
// Composition with RF-04 selection
// ---------------------------------------------------------------------------

describe("composition with RF-04 selection (K10, K13, K36)", () => {
  const registry = createInvitationRendererBindingRegistry([
    entry(FunctionRenderer),
    entry(MemoRenderer, { rendererKey: TEST_KEY_V2 }),
  ]);

  it.each([
    [TEST_KEY_V1, FunctionRenderer],
    [TEST_KEY_V2, MemoRenderer],
  ])("selects %s through RF-04 and resolves its exact component", (key, component) => {
    const selection = select(registry, key);
    expect(selection.rendererKey).toBe(key);
    expect(resolveInvitationRendererComponent(registry, selection.rendererKey)).toBe(component);
  });

  it("leaves RF-04 RENDERER_KEY_NOT_REGISTERED unchanged for an unbound key", () => {
    const error = caught(() => select(registry, "test.renderer.v3"));
    expect(error).toBeInstanceOf(RendererSelectionError);
    expect(error).not.toBeInstanceOf(RendererBindingInvariantError);
    expect((error as RendererSelectionError).code).toBe("RENDERER_KEY_NOT_REGISTERED");
  });

  it("leaves other RF-04 selection errors unchanged", () => {
    const narrow = createInvitationRendererBindingRegistry([entry(FunctionRenderer, { supportedVariants: ["GROOM"] })]);
    const error = caught(() => select(narrow));
    expect(error).toBeInstanceOf(RendererSelectionError);
    expect((error as RendererSelectionError).code).toBe("VARIANT_UNSUPPORTED");
  });
});

// ---------------------------------------------------------------------------
// Resolver defense against hand-built / corrupted registries
// ---------------------------------------------------------------------------

describe("resolveInvitationRendererComponent — corrupted registries fail closed (K12, K13)", () => {
  it("A: manifest present, component missing", () => {
    const registry = handBuilt({ [TEST_KEY_V1]: manifest() }, {});
    expectBindingInvariant(() => resolveInvitationRendererComponent(registry, TEST_KEY_V1));
  });

  it("B: component present, manifest missing", () => {
    const registry = handBuilt({}, { [TEST_KEY_V1]: FunctionRenderer });
    expectBindingInvariant(() => resolveInvitationRendererComponent(registry, TEST_KEY_V1));
  });

  it("C: malformed returned manifest throws RF-04 RendererSelectionInvariantError unchanged", () => {
    for (const bad of [
      malformedManifest((m) => delete m.sectionCapabilities),
      malformedManifest((m) => (m.extra = true)),
      "manifest",
      null,
    ]) {
      const registry = handBuilt({ [TEST_KEY_V1]: bad }, { [TEST_KEY_V1]: FunctionRenderer });
      expectRf04Invariant(() => resolveInvitationRendererComponent(registry, TEST_KEY_V1));
    }
  });

  it("C: a malformed manifest is reported before a missing component", () => {
    const registry = handBuilt({ [TEST_KEY_V1]: malformedManifest((m) => delete m.supportedVariants) }, {});
    expectRf04Invariant(() => resolveInvitationRendererComponent(registry, TEST_KEY_V1));
  });

  it("D: valid manifest whose rendererKey differs from the requested key", () => {
    const registry = handBuilt(
      { [TEST_KEY_V1]: manifest({ rendererKey: TEST_KEY_V2 }) },
      { [TEST_KEY_V1]: FunctionRenderer },
    );
    expectBindingInvariant(() => resolveInvitationRendererComponent(registry, TEST_KEY_V1));
  });

  it.each([
    ["null", null],
    ["string", "component"],
    ["plain object", {}],
    ["random $$typeof symbol", { $$typeof: Symbol("random") }],
  ])("E: lookupComponent returns a non-component (%s)", (_label, component) => {
    const registry = handBuilt({ [TEST_KEY_V1]: manifest() }, { [TEST_KEY_V1]: component });
    expectBindingInvariant(() => resolveInvitationRendererComponent(registry, TEST_KEY_V1));
  });

  it("F: registry without a usable lookupComponent", () => {
    const compatibilityRegistry = compatibilityRegistryWith({ [TEST_KEY_V1]: manifest() });
    for (const lookupComponent of [undefined, null, "lookup", {}]) {
      const registry = cast<InvitationRendererBindingRegistryV1>({ compatibilityRegistry, lookupComponent });
      expectBindingInvariant(() => resolveInvitationRendererComponent(registry, TEST_KEY_V1));
    }
    const missing = cast<InvitationRendererBindingRegistryV1>({ compatibilityRegistry });
    expectBindingInvariant(() => resolveInvitationRendererComponent(missing, TEST_KEY_V1));
  });

  it("G: registry without a usable compatibilityRegistry.lookup", () => {
    const lookupComponent = () => FunctionRenderer;
    for (const compatibilityRegistry of [undefined, null, "registry", [], {}, { lookup: "lookup" }]) {
      const registry = cast<InvitationRendererBindingRegistryV1>({ compatibilityRegistry, lookupComponent });
      expectBindingInvariant(() => resolveInvitationRendererComponent(registry, TEST_KEY_V1));
    }
  });

  it.each([null, undefined, "registry", 1, []])("rejects a non-object registry (%s)", (registry) => {
    expectBindingInvariant(() => resolveInvitationRendererComponent(cast(registry), TEST_KEY_V1));
  });

  it("rejects a non-string rendererKey", () => {
    const registry = createInvitationRendererBindingRegistry([entry()]);
    expectBindingInvariant(() => resolveInvitationRendererComponent(registry, cast(1)));
  });

  it("resolves a consistent hand-built registry to its exact component", () => {
    const registry = handBuilt({ [TEST_KEY_V1]: manifest() }, { [TEST_KEY_V1]: ForwardRefRenderer });
    expect(resolveInvitationRendererComponent(registry, TEST_KEY_V1)).toBe(ForwardRefRenderer);
  });
});
