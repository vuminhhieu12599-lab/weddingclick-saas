import { RendererBindingInvariantError } from "./renderer-binding-errors";
import {
  projectCompatibilityManifest,
  type RendererCompatibilityManifestV1,
} from "./renderer-compatibility-manifest";
import type { InvitationRendererComponentV1 } from "./renderer-component";
import { createRendererCompatibilityRegistry, type RendererCompatibilityRegistry } from "./renderer-registry";

/**
 * Invitation Rendering Foundation RF-05B — renderer implementation-binding
 * registry (docs/DECISIONS.md "RF-05 Shared Renderer Boundary / Minimum
 * Shared Client Capabilities Contract Clarification" K9–K13, K36).
 *
 * Composes the frozen RF-04 compatibility registry with an exact
 * `rendererKey` → component mapping. No discovery, no production entries,
 * no fallback/default/latest renderer. Nothing here renders or executes a
 * component.
 */

/** K9: exactly these two fields; the key is only `compatibilityManifest.rendererKey`. */
export interface RendererBindingEntryV1 {
  readonly compatibilityManifest: RendererCompatibilityManifestV1;
  readonly component: InvitationRendererComponentV1;
}

/** K10: owns the RF-04 compatibility registry plus a private exact-key component map. */
export interface InvitationRendererBindingRegistryV1 {
  /** The RF-04 registry built from exactly the bound manifests; use it for RF-04 selection. */
  readonly compatibilityRegistry: RendererCompatibilityRegistry;
  /**
   * Raw exact-key lookup: `undefined` when the key has no binding. No
   * normalization, prefix/version matching or default. Not a selection step;
   * use `resolveInvitationRendererComponent` after RF-04 selection.
   */
  lookupComponent(rendererKey: string): InvitationRendererComponentV1 | undefined;
}

const BINDING_ENTRY_KEYS = [
  "compatibilityManifest",
  "component",
] as const satisfies readonly (keyof RendererBindingEntryV1)[];

/**
 * React 19 exotic component markers (registry symbols, so no React runtime
 * import is needed). These are the only object forms assignable to
 * `ComponentType<P>`: `memo(...)`, `forwardRef(...)` and `lazy(...)`.
 * Context, Provider, Fragment, Suspense and other element types are not.
 */
const REACT_MEMO_TYPE = Symbol.for("react.memo");
const REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
const REACT_LAZY_TYPE = Symbol.for("react.lazy");

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural runtime check for `InvitationRendererComponentV1`; never calls,
 * constructs or renders the value. Function and class components are
 * functions. A `memo` object must wrap a component (`type`), a `forwardRef`
 * object must carry a `render` function, and a `lazy` object is accepted by
 * its marker because its payload is resolved only at render time. Any other
 * `$$typeof` symbol is rejected.
 */
function isRendererComponent(value: unknown): value is InvitationRendererComponentV1 {
  const visited = new Set<unknown>();
  let current: unknown = value;
  while (!visited.has(current)) {
    visited.add(current);
    if (typeof current === "function") return true;
    if (!isPlainRecord(current)) return false;
    const marker = current.$$typeof;
    if (marker === REACT_FORWARD_REF_TYPE) return typeof current.render === "function";
    if (marker === REACT_LAZY_TYPE) return true;
    if (marker !== REACT_MEMO_TYPE) return false;
    current = current.type;
  }
  return false;
}

/** Exactly the two entry keys as own properties, and nothing else (string or symbol). */
function hasExactEntryKeys(record: Record<string, unknown>): boolean {
  const ownKeys = Reflect.ownKeys(record);
  return (
    ownKeys.length === BINDING_ENTRY_KEYS.length &&
    BINDING_ENTRY_KEYS.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  );
}

/**
 * Builds a binding registry from an explicit entry list, fail-fast in input
 * order: entry shape, component form, RF-04 manifest projection (its
 * `RendererSelectionInvariantError` propagates unchanged), then the RF-05
 * duplicate-key check. Only after every entry passes is the RF-04 registry
 * created, so a duplicate key is always a `RendererBindingInvariantError`
 * (K11–K12). Caller inputs are read once and never retained or frozen.
 */
export function createInvitationRendererBindingRegistry(
  entries: readonly RendererBindingEntryV1[],
): InvitationRendererBindingRegistryV1 {
  if (!Array.isArray(entries)) {
    throw new RendererBindingInvariantError("Renderer binding entries must be an array");
  }

  const manifests: RendererCompatibilityManifestV1[] = [];
  const components = new Map<string, InvitationRendererComponentV1>();
  // Indexed loop so a sparse-array hole is read as `undefined` and rejected.
  for (let index = 0; index < entries.length; index += 1) {
    const entry: unknown = entries[index];
    if (!isPlainRecord(entry) || !hasExactEntryKeys(entry)) {
      throw new RendererBindingInvariantError(
        `Renderer binding entry ${index} must have exactly compatibilityManifest and component`,
      );
    }
    const { compatibilityManifest, component } = entry;
    if (!isRendererComponent(component)) {
      throw new RendererBindingInvariantError(`Renderer binding entry ${index} component is not a React component`);
    }
    const manifest = projectCompatibilityManifest(compatibilityManifest);
    if (components.has(manifest.rendererKey)) {
      throw new RendererBindingInvariantError(`Duplicate renderer binding for rendererKey ${manifest.rendererKey}`);
    }
    manifests.push(manifest);
    components.set(manifest.rendererKey, component);
  }

  const compatibilityRegistry = createRendererCompatibilityRegistry(manifests);

  return Object.freeze({
    compatibilityRegistry,
    lookupComponent(rendererKey: string): InvitationRendererComponentV1 | undefined {
      return components.get(rendererKey);
    },
  });
}

function assertBindingRegistryShape(registry: unknown): asserts registry is InvitationRendererBindingRegistryV1 {
  if (!isPlainRecord(registry)) {
    throw new RendererBindingInvariantError("Renderer binding registry must be an object");
  }
  const { compatibilityRegistry, lookupComponent } = registry;
  if (!isPlainRecord(compatibilityRegistry) || typeof compatibilityRegistry.lookup !== "function") {
    throw new RendererBindingInvariantError("Renderer binding registry has no usable compatibilityRegistry.lookup");
  }
  if (typeof lookupComponent !== "function") {
    throw new RendererBindingInvariantError("Renderer binding registry has no usable lookupComponent");
  }
}

/**
 * K13 fail-closed resolution of the component for an already-selected
 * `rendererKey` (run `selectRendererCompatibility` against
 * `registry.compatibilityRegistry` first; RF-04 selection errors are its
 * own). Pure and synchronous. A hand-built or runtime-corrupted registry
 * whose manifest and component bindings disagree throws
 * `RendererBindingInvariantError`; a malformed returned manifest throws the
 * RF-04 `RendererSelectionInvariantError` unchanged. Never falls back.
 */
export function resolveInvitationRendererComponent(
  registry: InvitationRendererBindingRegistryV1,
  rendererKey: string,
): InvitationRendererComponentV1 {
  assertBindingRegistryShape(registry);
  if (typeof rendererKey !== "string") {
    throw new RendererBindingInvariantError("Renderer binding rendererKey must be a string");
  }

  const registered = registry.compatibilityRegistry.lookup(rendererKey);
  if (registered === undefined) {
    throw new RendererBindingInvariantError(`Renderer ${rendererKey} has no compatibility manifest in the binding registry`);
  }
  const manifest = projectCompatibilityManifest(registered);
  if (manifest.rendererKey !== rendererKey) {
    throw new RendererBindingInvariantError(
      `Binding registry returned manifest ${manifest.rendererKey} for rendererKey ${rendererKey}`,
    );
  }

  const component: unknown = registry.lookupComponent(rendererKey);
  if (component === undefined) {
    throw new RendererBindingInvariantError(`Renderer ${rendererKey} has no component binding`);
  }
  if (!isRendererComponent(component)) {
    throw new RendererBindingInvariantError(`Renderer ${rendererKey} component binding is not a React component`);
  }
  return component;
}
