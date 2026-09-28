import {
  projectCompatibilityManifest,
  type RendererCompatibilityManifestV1,
} from "./renderer-compatibility-manifest";
import { RendererSelectionInvariantError } from "./renderer-selection-errors";

/**
 * RF-04 compatibility-manifest registry (docs/DECISIONS.md RF-04
 * clarification R12–R15): `rendererKey` → `RendererCompatibilityManifestV1`
 * only. No renderer implementation, no discovery (filesystem, modules,
 * database, environment) and no production entries; callers pass manifests
 * explicitly.
 */
export interface RendererCompatibilityRegistry {
  /**
   * Exact-key lookup (R4): `undefined` when the key is not registered. No
   * normalization, prefix/version matching or default. The returned
   * manifest is registry-owned and deeply frozen.
   */
  lookup(rendererKey: string): RendererCompatibilityManifestV1 | undefined;
}

function freezeManifest(manifest: RendererCompatibilityManifestV1): RendererCompatibilityManifestV1 {
  Object.freeze(manifest.supportedPayloadSchemaVersions);
  Object.freeze(manifest.supportedVariants);
  Object.freeze(manifest.sectionCapabilities);
  return Object.freeze(manifest);
}

/**
 * Builds a registry from an explicit manifest list. Each manifest is
 * validated (R14) and stored as a frozen registry-owned copy, so later
 * mutation of the caller's objects cannot change registry behavior. The
 * lookup key is always the validated `manifest.rendererKey`, so a key/manifest
 * disagreement cannot be expressed. A duplicate key fails closed (R13):
 * never first-write-wins or last-write-wins. Input order does not affect
 * lookup results.
 */
export function createRendererCompatibilityRegistry(
  manifests: readonly RendererCompatibilityManifestV1[],
): RendererCompatibilityRegistry {
  if (!Array.isArray(manifests)) {
    throw new RendererSelectionInvariantError("Compatibility manifests must be an array");
  }

  const byKey = new Map<string, RendererCompatibilityManifestV1>();
  for (const manifest of manifests) {
    const owned = freezeManifest(projectCompatibilityManifest(manifest));
    if (byKey.has(owned.rendererKey)) {
      throw new RendererSelectionInvariantError(`Duplicate compatibility manifest for rendererKey ${owned.rendererKey}`);
    }
    byKey.set(owned.rendererKey, owned);
  }

  return Object.freeze({
    lookup(rendererKey: string): RendererCompatibilityManifestV1 | undefined {
      return byKey.get(rendererKey);
    },
  });
}
