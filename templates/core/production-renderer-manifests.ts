import {
  createRendererCompatibilityRegistry,
  type RendererCompatibilityRegistry,
} from "../../lib/invitation-rendering/renderer-registry";
import { ELEGANT_EDITORIAL_V1_MANIFEST } from "../wedding/elegant-editorial/v1/manifest";
import { ROMANTIC_MINIMAL_V1_MANIFEST } from "../wedding/romantic-minimal/v1/manifest";
import { VIETNAMESE_HERITAGE_V1_MANIFEST } from "../wedding/vietnamese-heritage/v1/manifest";
import {
  RENDERER_PRODUCTION_MANIFEST_ERROR_MESSAGES,
  RendererProductionManifestInvariantError,
  validateRendererProductionManifest,
  type RendererProductionManifestV1,
} from "./renderer-manifest";

/**
 * Invitation Rendering Foundation RF-06A — production manifest list and the
 * server-safe production compatibility registry (docs/DECISIONS.md "RF-06-0
 * First Production Renderer Contract Clarification" P20, P27 A, P28).
 *
 * Server-safe: no React, no client code, no renderer components, no
 * capability adapters. The list is explicit and ordered; nothing is
 * discovered from the filesystem, modules, database or environment, and
 * there is no fallback, default, "latest" or alias. The RF-05 binding
 * registry (P27 B) is RF-06B.
 */

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * P19 for every entry, then P20 duplicate `rendererKey` rejection under
 * RF-06 ownership, before any RF-04/RF-05 factory can see the list. Returns
 * a frozen list of fresh, deeply frozen validated copies that share no
 * object with the input. Input order is preserved; nothing is deduplicated.
 */
export function validateProductionRendererManifests(
  manifests: readonly unknown[],
): readonly RendererProductionManifestV1[] {
  if (!Array.isArray(manifests)) {
    throw new RendererProductionManifestInvariantError(RENDERER_PRODUCTION_MANIFEST_ERROR_MESSAGES.MANIFEST_LIST);
  }
  const validated = manifests.map((manifest) => validateRendererProductionManifest(manifest));
  const seen = new Set<string>();
  for (const manifest of validated) {
    if (seen.has(manifest.compatibility.rendererKey)) {
      throw new RendererProductionManifestInvariantError(
        RENDERER_PRODUCTION_MANIFEST_ERROR_MESSAGES.DUPLICATE_RENDERER_KEY,
      );
    }
    seen.add(manifest.compatibility.rendererKey);
  }
  return deepFreeze(validated);
}

/**
 * P27: the one ordered, explicit production manifest list feeding both
 * compositions: Elegant Editorial v1, Vietnamese Heritage v1 (VH-01), then
 * Romantic Minimal v1 (RM-02).
 * Registration here is code compatibility only; a renderer is selectable
 * only through an active catalog TemplateVersion row (not seeded for
 * Vietnamese Heritage in VH-01 nor for Romantic Minimal in RM-02). Validated at module load, so a malformed
 * production manifest fails closed on import.
 */
export const PRODUCTION_RENDERER_MANIFESTS: readonly RendererProductionManifestV1[] =
  validateProductionRendererManifests([
    ELEGANT_EDITORIAL_V1_MANIFEST,
    VIETNAMESE_HERITAGE_V1_MANIFEST,
    ROMANTIC_MINIMAL_V1_MANIFEST,
  ]);

/**
 * P27: readonly production key list derived from the manifest list, for
 * key-set equality checks. Never hand-typed and never added to the frozen
 * RF-04/RF-05 modules.
 */
export const PRODUCTION_RENDERER_KEYS: readonly string[] = Object.freeze(
  PRODUCTION_RENDERER_MANIFESTS.map((manifest) => manifest.compatibility.rendererKey),
);

/** P27 A: the minimal server-safe surface later server compositions need. */
export interface ProductionCompatibilityRegistryV1 {
  /** The RF-04 registry for `selectRendererCompatibility`. */
  readonly compatibility: RendererCompatibilityRegistry;
  /**
   * Exact-key lookup of the validated full manifest: `undefined` when not
   * registered. No normalization, fallback or default. The result is
   * registry-owned and deeply frozen.
   */
  lookupManifest(rendererKey: string): RendererProductionManifestV1 | undefined;
}

/**
 * Builds the server-safe production compatibility registry: validates the
 * full manifests and rejects duplicates (RF-06 errors), then builds the
 * frozen RF-04 registry from the projected compatibility manifests. RF-04
 * errors propagate unchanged. Later mutation of the caller's objects cannot
 * change registry behavior.
 */
export function createProductionCompatibilityRegistry(
  manifests: readonly unknown[],
): ProductionCompatibilityRegistryV1 {
  const validated = validateProductionRendererManifests(manifests);
  const compatibility = createRendererCompatibilityRegistry(validated.map((manifest) => manifest.compatibility));

  const byKey = new Map<string, RendererProductionManifestV1>();
  for (const manifest of validated) {
    byKey.set(manifest.compatibility.rendererKey, manifest);
  }

  return Object.freeze({
    compatibility,
    lookupManifest(rendererKey: string): RendererProductionManifestV1 | undefined {
      return byKey.get(rendererKey);
    },
  });
}

/** P27 A: the production instance, built only from `PRODUCTION_RENDERER_MANIFESTS`. */
export const PRODUCTION_COMPATIBILITY_REGISTRY: ProductionCompatibilityRegistryV1 =
  createProductionCompatibilityRegistry(PRODUCTION_RENDERER_MANIFESTS);
