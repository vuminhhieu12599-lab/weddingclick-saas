import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RendererBindingInvariantError } from "../../../lib/invitation-rendering/renderer-binding-errors";
import { resolveInvitationRendererComponent } from "../../../lib/invitation-rendering/renderer-binding-registry";
import { projectCompatibilityManifest } from "../../../lib/invitation-rendering/renderer-compatibility-manifest";
import type { InvitationRendererComponentV1 } from "../../../lib/invitation-rendering/renderer-component";
import { RendererSelectionInvariantError } from "../../../lib/invitation-rendering/renderer-selection-errors";
import { ELEGANT_EDITORIAL_V1_MANIFEST } from "../../wedding/elegant-editorial/v1/manifest";
import {
  PRODUCTION_COMPATIBILITY_REGISTRY,
  PRODUCTION_RENDERER_KEYS,
  PRODUCTION_RENDERER_MANIFESTS,
} from "../production-renderer-manifests";
import { RendererProductionManifestInvariantError, type RendererProductionManifestV1 } from "../renderer-manifest";
import { buildRendererFixture } from "../fixtures/renderer-fixture-pipeline";
import { renderToStaticMarkupAsync } from "./support/render-static-markup";

// VH-01: the production binding registry also binds Vietnamese Heritage v1, whose
// next/font loaders only run under the Next compiler.
vi.mock("../../wedding/vietnamese-heritage/v1/fonts", () => ({
  VIETNAMESE_HERITAGE_V1_FONT_VARIABLES_CLASS_NAME: "vh-test-font-variables",
}));
vi.mock("../../wedding/elegant-editorial/v1/fonts", () => ({
  ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables",
}));

const {
  PRODUCTION_RENDERER_BINDING_ERROR_MESSAGES,
  PRODUCTION_RENDERER_BINDING_REGISTRY,
  createProductionRendererBindingRegistry,
} = await import("../production-renderer-bindings");
const { ElegantEditorialV1 } = await import("../../wedding/elegant-editorial/v1/elegant-editorial-v1");
const { VietnameseHeritageV1 } = await import("../../wedding/vietnamese-heritage/v1/vietnamese-heritage-v1");

/**
 * RF-06B production binding registry (docs/DECISIONS.md "RF-06-0 …" P27 B,
 * P28): exact key-set equality with the server-safe compatibility registry,
 * no unbound manifest, no orphan binding, fail-closed resolution, and the
 * validated manifest list (never the raw constant) as authority.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

const OtherComponent: InvitationRendererComponentV1 = () => null;

const EE_KEY = "wedding.elegant-editorial.v1";
const VH_KEY = "wedding.vietnamese-heritage.v1";

/** The real production key → component pairs (VH-01: two renderers). */
function productionComponents(): Map<string, InvitationRendererComponentV1> {
  return new Map<string, InvitationRendererComponentV1>([
    [EE_KEY, ElegantEditorialV1],
    [VH_KEY, VietnameseHeritageV1],
  ]);
}

/**
 * RS-01: a production binding is a `next/dynamic` loadable component (a function
 * component the frozen RF-05 registry accepts unchanged), never the renderer root itself.
 */
function isDeferred(value: unknown): boolean {
  return (
    typeof value === "function" &&
    (value as { displayName?: unknown }).displayName === "LoadableComponent" &&
    value !== ElegantEditorialV1 &&
    value !== VietnameseHeritageV1
  );
}

const FIXTURES = new Map<string, Awaited<ReturnType<typeof buildRendererFixture>>>();

async function fixtureFor(variant: "COMMON" | "BRIDE") {
  const cached = FIXTURES.get(variant) ?? (await buildRendererFixture({ variant }));
  FIXTURES.set(variant, cached);
  return cached;
}

/** The lazy binding's markup once its chunk has loaded, with no capabilities. */
async function lazyMarkup(component: InvitationRendererComponentV1, variant: "COMMON" | "BRIDE"): Promise<string> {
  const { viewModel, selection } = await fixtureFor(variant);
  return renderToStaticMarkupAsync(createElement(component, { viewModel, sections: selection.effectiveSections, capabilities: {} }));
}

/** The renderer root rendered directly (cached fixture from `lazyMarkup`). */
function directMarkup(component: InvitationRendererComponentV1, variant: "COMMON" | "BRIDE"): string {
  const { viewModel, selection } = FIXTURES.get(variant)!;
  return renderToStaticMarkup(createElement(component, { viewModel, sections: selection.effectiveSections, capabilities: {} }));
}

function withKey(key: string): RendererProductionManifestV1 {
  const base = PRODUCTION_RENDERER_MANIFESTS[0] as RendererProductionManifestV1;
  return { ...base, compatibility: { ...base.compatibility, rendererKey: key } };
}

describe("key-set equality (P27)", () => {
  it("every PRODUCTION_RENDERER_KEYS entry resolves in the server-safe compatibility registry (A)", () => {
    expect(PRODUCTION_RENDERER_KEYS.length).toBeGreaterThan(0);
    for (const key of PRODUCTION_RENDERER_KEYS) {
      expect(PRODUCTION_COMPATIBILITY_REGISTRY.compatibility.lookup(key)?.rendererKey, key).toBe(key);
      expect(PRODUCTION_COMPATIBILITY_REGISTRY.lookupManifest(key)?.compatibility.rendererKey, key).toBe(key);
    }
  });

  it("every PRODUCTION_RENDERER_KEYS entry resolves to a component in the client binding registry (B)", () => {
    for (const key of PRODUCTION_RENDERER_KEYS) {
      expect(PRODUCTION_RENDERER_BINDING_REGISTRY.compatibilityRegistry.lookup(key)?.rendererKey, key).toBe(key);
      // RS-01: every production binding is a deferred next/dynamic component (one renderer chunk set per key).
      expect(isDeferred(PRODUCTION_RENDERER_BINDING_REGISTRY.lookupComponent(key)), key).toBe(true);
      expect(isDeferred(resolveInvitationRendererComponent(PRODUCTION_RENDERER_BINDING_REGISTRY, key)), key).toBe(true);
    }
  });

  it("A and B expose identical compatibility manifests for the same key set", () => {
    for (const key of PRODUCTION_RENDERER_KEYS) {
      expect(PRODUCTION_RENDERER_BINDING_REGISTRY.compatibilityRegistry.lookup(key)).toStrictEqual(
        PRODUCTION_COMPATIBILITY_REGISTRY.compatibility.lookup(key),
      );
    }
    expect(new Set(PRODUCTION_RENDERER_KEYS).size).toBe(PRODUCTION_RENDERER_KEYS.length);
    expect(PRODUCTION_RENDERER_KEYS).toStrictEqual(
      PRODUCTION_RENDERER_MANIFESTS.map((manifest) => manifest.compatibility.rendererKey),
    );
  });

  it("there is no unbound production manifest", () => {
    for (const manifest of PRODUCTION_RENDERER_MANIFESTS) {
      expect(PRODUCTION_RENDERER_BINDING_REGISTRY.lookupComponent(manifest.compatibility.rendererKey)).toBeDefined();
    }
  });
});

describe("Elegant Editorial binding", () => {
  it("wedding.elegant-editorial.v1 resolves to a deferred binding of exactly ElegantEditorialV1", async () => {
    // VH-01 generalization: the production key list is now exactly EE then VH (was EE only).
    expect(PRODUCTION_RENDERER_KEYS).toStrictEqual([EE_KEY, VH_KEY]);
    const bound = resolveInvitationRendererComponent(PRODUCTION_RENDERER_BINDING_REGISTRY, "wedding.elegant-editorial.v1");
    expect(isDeferred(bound)).toBe(true);
    expect(await lazyMarkup(bound, "COMMON")).toBe(directMarkup(ElegantEditorialV1, "COMMON"));
  });

  it("the bound manifest is the validated projection, not the raw source constant", () => {
    const bound = PRODUCTION_RENDERER_BINDING_REGISTRY.compatibilityRegistry.lookup("wedding.elegant-editorial.v1");
    expect(bound).toStrictEqual(projectCompatibilityManifest(PRODUCTION_RENDERER_MANIFESTS[0]?.compatibility));
    expect(bound).not.toBe(ELEGANT_EDITORIAL_V1_MANIFEST.compatibility);
    expect(bound).not.toBe(PRODUCTION_RENDERER_MANIFESTS[0]?.compatibility);
  });

  it("source: binds from PRODUCTION_RENDERER_MANIFESTS and never imports the raw v1 manifest", () => {
    const source = readFileSync(join(REPO_ROOT, "templates/core/production-renderer-bindings.ts"), "utf8");
    expect(source).toContain(
      "createProductionRendererBindingRegistry(PRODUCTION_RENDERER_MANIFESTS, PRODUCTION_RENDERER_COMPONENTS)",
    );
    expect(source).not.toMatch(/ELEGANT_EDITORIAL_V1_MANIFEST|v1\/manifest|validateRendererProductionManifest\(/);
  });
});

describe("Vietnamese Heritage binding (VH-01)", () => {
  it("wedding.vietnamese-heritage.v1 resolves to a deferred binding of exactly VietnameseHeritageV1, distinct from Elegant Editorial", async () => {
    const vh = resolveInvitationRendererComponent(PRODUCTION_RENDERER_BINDING_REGISTRY, VH_KEY);
    const ee = resolveInvitationRendererComponent(PRODUCTION_RENDERER_BINDING_REGISTRY, EE_KEY);
    expect(isDeferred(vh)).toBe(true);
    expect(vh).not.toBe(ee);
    const vhMarkup = await lazyMarkup(vh, "BRIDE");
    expect(vhMarkup).toBe(directMarkup(VietnameseHeritageV1, "BRIDE"));
    expect(vhMarkup).toContain('data-renderer="vietnamese-heritage-v1"');
    expect(vhMarkup).not.toContain("elegant-editorial-v1");
  });

  it("the bound manifest is the validated projection, not the raw source constant", () => {
    const bound = PRODUCTION_RENDERER_BINDING_REGISTRY.compatibilityRegistry.lookup(VH_KEY);
    expect(bound).toStrictEqual(projectCompatibilityManifest(PRODUCTION_RENDERER_MANIFESTS[1]?.compatibility));
    expect(bound).toStrictEqual(PRODUCTION_COMPATIBILITY_REGISTRY.compatibility.lookup(VH_KEY));
    expect(bound).not.toBe(PRODUCTION_RENDERER_MANIFESTS[1]?.compatibility);
  });

  it.each([
    "wedding.vietnamese-heritage.v2",
    "wedding.vietnamese-heritage",
    "wedding.vietnamese-heritage.latest",
    "wedding.vietnamese-heritage.V1",
    "Wedding.vietnamese-heritage.v1",
    " wedding.vietnamese-heritage.v1",
    "wedding.vietnamese-heritage.v1 ",
    "vietnamese-heritage",
    "Vietnamese Heritage",
    "wedding.heritage-vermilion.v1",
  ])("unknown key %j throws RendererBindingInvariantError", (key) => {
    expect(PRODUCTION_RENDERER_BINDING_REGISTRY.lookupComponent(key)).toBeUndefined();
    expect(() => resolveInvitationRendererComponent(PRODUCTION_RENDERER_BINDING_REGISTRY, key)).toThrow(
      RendererBindingInvariantError,
    );
  });
});

describe("fail closed: no default, fallback, latest or alias", () => {
  it.each([
    "wedding.elegant-editorial.v2",
    "wedding.elegant-editorial",
    "wedding.elegant-editorial.latest",
    "wedding.elegant-editorial.V1",
    " wedding.elegant-editorial.v1",
    "elegant-editorial",
    "default",
    "",
  ])("unknown key %j throws RendererBindingInvariantError", (key) => {
    expect(PRODUCTION_RENDERER_BINDING_REGISTRY.lookupComponent(key)).toBeUndefined();
    expect(() => resolveInvitationRendererComponent(PRODUCTION_RENDERER_BINDING_REGISTRY, key)).toThrow(
      RendererBindingInvariantError,
    );
  });

  it("the registry object is frozen", () => {
    expect(Object.isFrozen(PRODUCTION_RENDERER_BINDING_REGISTRY)).toBe(true);
  });
});

describe("createProductionRendererBindingRegistry invariants", () => {
  it("an unbound production manifest fails closed with a fixed RF-06 message", () => {
    const manifests = [...PRODUCTION_RENDERER_MANIFESTS, withKey("wedding.unbound-template.v1")];
    // VH-01: every real production manifest is bound, so only the added manifest is unbound.
    const components = productionComponents();
    expect(() => createProductionRendererBindingRegistry(manifests, components)).toThrow(
      new RendererProductionManifestInvariantError(PRODUCTION_RENDERER_BINDING_ERROR_MESSAGES.UNBOUND_MANIFEST),
    );
  });

  it("an orphan component binding fails closed with a fixed RF-06 message", () => {
    // VH-01: both real bindings plus one orphan (with EE only, VH would fail first as unbound).
    const components = productionComponents();
    components.set("wedding.orphan-template.v1", OtherComponent);
    expect(() => createProductionRendererBindingRegistry(PRODUCTION_RENDERER_MANIFESTS, components)).toThrow(
      new RendererProductionManifestInvariantError(PRODUCTION_RENDERER_BINDING_ERROR_MESSAGES.ORPHAN_COMPONENT),
    );
  });

  it("messages never echo a renderer key", () => {
    for (const message of Object.values(PRODUCTION_RENDERER_BINDING_ERROR_MESSAGES)) {
      expect(message).not.toMatch(/wedding\.|elegant/);
    }
  });

  it("a duplicate manifest key propagates the RF-05 binding error unchanged", () => {
    const manifests = [...PRODUCTION_RENDERER_MANIFESTS, ...PRODUCTION_RENDERER_MANIFESTS];
    // VH-01: both real bindings, so the duplicate key (not an unbound manifest) is what fails.
    const components = productionComponents();
    expect(() => createProductionRendererBindingRegistry(manifests, components)).toThrow(RendererBindingInvariantError);
  });

  it("a malformed compatibility manifest propagates the RF-04 invariant error unchanged", () => {
    const base = PRODUCTION_RENDERER_MANIFESTS[0] as RendererProductionManifestV1;
    const broken = { ...base, compatibility: { ...base.compatibility, supportedVariants: ["COMMON", "MAYBE_NOT"] } };
    const components = new Map<string, InvitationRendererComponentV1>([["wedding.elegant-editorial.v1", ElegantEditorialV1]]);
    expect(() =>
      createProductionRendererBindingRegistry([broken as unknown as RendererProductionManifestV1], components),
    ).toThrow(RendererSelectionInvariantError);
  });

  it("the explicit list order is preserved and no key is discovered", () => {
    const second = withKey("wedding.second-template.v1");
    const registry = createProductionRendererBindingRegistry(
      [PRODUCTION_RENDERER_MANIFESTS[0] as RendererProductionManifestV1, second],
      new Map<string, InvitationRendererComponentV1>([
        ["wedding.elegant-editorial.v1", ElegantEditorialV1],
        ["wedding.second-template.v1", OtherComponent],
      ]),
    );
    expect(resolveInvitationRendererComponent(registry, "wedding.second-template.v1")).toBe(OtherComponent);
    expect(resolveInvitationRendererComponent(registry, "wedding.elegant-editorial.v1")).toBe(ElegantEditorialV1);
    expect(registry.lookupComponent("wedding.third-template.v1")).toBeUndefined();
  });
});
