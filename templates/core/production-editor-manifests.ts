import { ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST } from "../editor/wedding/elegant-editorial-v1";
import { ROMANTIC_MINIMAL_V1_EDITOR_MANIFEST } from "../editor/wedding/romantic-minimal-v1";
import { VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST } from "../editor/wedding/vietnamese-heritage-v1";
import {
  TemplateEditorManifestInvariantError,
  validateTemplateEditorManifest,
  type TemplateEditorManifestV1,
} from "./editor-manifest";
import { PRODUCTION_RENDERER_MANIFESTS } from "./production-renderer-manifests";
import type { RendererProductionManifestV1 } from "./renderer-manifest";

/**
 * TE-02 — production Template Editor Manifest list and its server-safe
 * lookup (docs/DECISIONS.md "TE-02").
 *
 * Server-safe: no React, no client code, no renderer components. The list
 * is explicit and ordered; nothing is discovered from the filesystem,
 * modules, database or environment, and there is no fallback, default,
 * "latest" or alias. Every editor manifest is cross-checked against the
 * already-validated RF-06 production renderer manifests, which are not
 * changed.
 */

export const PRODUCTION_EDITOR_MANIFEST_ERROR_MESSAGES = Object.freeze({
  MANIFEST_LIST: "Production editor manifests must be an array",
  DUPLICATE_RENDERER_KEY: "Production editor manifests contain a duplicate rendererKey",
  ORPHAN_EDITOR_MANIFEST: "Production editor manifest has no production renderer manifest",
  MISSING_EDITOR_MANIFEST: "Production renderer manifest has no production editor manifest",
  ORDER_MISMATCH: "Production editor manifests must follow the production renderer manifest order",
  CONTENT_SECTION_NOT_CAPABLE: "Production editor manifest content item names a section the renderer is not capable of",
  SLOT_SECTION_NOT_CAPABLE: "Production editor manifest media slot names a section the renderer is not capable of",
} as const);

const MESSAGES = PRODUCTION_EDITOR_MANIFEST_ERROR_MESSAGES;

function fail(message: string): never {
  throw new TemplateEditorManifestInvariantError(message);
}

/** Every section-backed content item and section-linked slot needs a capable renderer section. */
function assertSectionsCapable(editor: TemplateEditorManifestV1, renderer: RendererProductionManifestV1): void {
  const capabilities = renderer.compatibility.sectionCapabilities;
  for (const item of editor.contentItems) {
    if (item.sectionKey !== null && capabilities[item.sectionKey] !== true) {
      fail(MESSAGES.CONTENT_SECTION_NOT_CAPABLE);
    }
  }
  for (const slot of editor.mediaSlots) {
    if (slot.sectionKey !== null && capabilities[slot.sectionKey] !== true) {
      fail(MESSAGES.SLOT_SECTION_NOT_CAPABLE);
    }
  }
}

/**
 * Validates every editor manifest, rejects duplicates, then requires the
 * editor key list to equal the production renderer key list exactly and in
 * the same order (no missing, no orphan), and checks section capabilities
 * against each renderer's production manifest. Returns a frozen list of
 * fresh, deeply frozen validated copies; input order is preserved.
 */
export function validateProductionEditorManifests(
  editorManifests: readonly unknown[],
  rendererManifests: readonly RendererProductionManifestV1[],
): readonly TemplateEditorManifestV1[] {
  if (!Array.isArray(editorManifests)) {
    fail(MESSAGES.MANIFEST_LIST);
  }
  const validated = editorManifests.map((manifest) => validateTemplateEditorManifest(manifest));

  const editorKeys = new Set<string>();
  for (const manifest of validated) {
    if (editorKeys.has(manifest.rendererKey)) {
      fail(MESSAGES.DUPLICATE_RENDERER_KEY);
    }
    editorKeys.add(manifest.rendererKey);
  }

  const rendererByKey = new Map<string, RendererProductionManifestV1>();
  for (const renderer of rendererManifests) {
    rendererByKey.set(renderer.compatibility.rendererKey, renderer);
  }
  for (const manifest of validated) {
    if (!rendererByKey.has(manifest.rendererKey)) {
      fail(MESSAGES.ORPHAN_EDITOR_MANIFEST);
    }
  }
  for (const rendererKey of rendererByKey.keys()) {
    if (!editorKeys.has(rendererKey)) {
      fail(MESSAGES.MISSING_EDITOR_MANIFEST);
    }
  }
  rendererManifests.forEach((renderer, index) => {
    if (validated[index]?.rendererKey !== renderer.compatibility.rendererKey) {
      fail(MESSAGES.ORDER_MISMATCH);
    }
  });

  for (const manifest of validated) {
    assertSectionsCapable(manifest, rendererByKey.get(manifest.rendererKey) as RendererProductionManifestV1);
  }

  return Object.freeze(validated);
}

/** The minimal server-safe editor lookup later Staff/readiness/Snapshot orchestration needs. */
export interface ProductionEditorRegistryV1 {
  /**
   * Exact-key lookup: `undefined` when not registered. No normalization,
   * fallback or default. The result is registry-owned and deeply frozen.
   */
  lookupEditorManifest(rendererKey: string): TemplateEditorManifestV1 | undefined;
}

export function createProductionEditorRegistry(
  editorManifests: readonly unknown[],
  rendererManifests: readonly RendererProductionManifestV1[],
): ProductionEditorRegistryV1 {
  const validated = validateProductionEditorManifests(editorManifests, rendererManifests);
  const byKey = new Map<string, TemplateEditorManifestV1>();
  for (const manifest of validated) {
    byKey.set(manifest.rendererKey, manifest);
  }
  return Object.freeze({
    lookupEditorManifest(rendererKey: string): TemplateEditorManifestV1 | undefined {
      return byKey.get(rendererKey);
    },
  });
}

/**
 * The one ordered, explicit production editor manifest list: Elegant
 * Editorial v1, Vietnamese Heritage v1, then Romantic Minimal v1, matching
 * `PRODUCTION_RENDERER_MANIFESTS`. Validated at module load, so a malformed,
 * missing, orphan or incapable editor manifest fails closed on import.
 */
export const PRODUCTION_EDITOR_MANIFESTS: readonly TemplateEditorManifestV1[] = validateProductionEditorManifests(
  [ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST, VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST, ROMANTIC_MINIMAL_V1_EDITOR_MANIFEST],
  PRODUCTION_RENDERER_MANIFESTS,
);

export const PRODUCTION_EDITOR_REGISTRY: ProductionEditorRegistryV1 = createProductionEditorRegistry(
  PRODUCTION_EDITOR_MANIFESTS,
  PRODUCTION_RENDERER_MANIFESTS,
);

/** Exact-key production lookup; `undefined` for an unregistered key (no fallback). */
export function lookupTemplateEditorManifest(rendererKey: string): TemplateEditorManifestV1 | undefined {
  return PRODUCTION_EDITOR_REGISTRY.lookupEditorManifest(rendererKey);
}
