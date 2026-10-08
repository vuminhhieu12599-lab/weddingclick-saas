import type { EventType, TemplateDesignManifestV1 } from "../../domain";
import type { TemplateEditorManifestV1 } from "../../../templates/core/editor-manifest";

/**
 * Template catalog DTO shapes (Task 028). `designManifest` is the validated
 * TemplateDesignManifestV1 subset only (Task 028 closure §4/§10) — the raw
 * `template_versions.manifest` JSONB, which may carry additional Task-029
 * renderer metadata, is never exposed by this route.
 */
export interface TemplateVersionCatalogEntry {
  id: string;
  versionNumber: number;
  rendererKey: string;
  designManifest: TemplateDesignManifestV1;
  /**
   * TE-05A: the validated, registry-owned TemplateEditorManifestV1 of this
   * version's renderer, looked up server-side by the exact `rendererKey`
   * (never read from the DB manifest JSON, never accepted from a client).
   * `null` only when the renderer key is not a production renderer at all
   * (such a version cannot render); every production renderer has one
   * (TE-02 key-set equality). TE-05A-H1: such a version is listed for
   * diagnosis but `selectable` is always false.
   */
  editorManifest: TemplateEditorManifestV1 | null;
  retiredAt: string | null;
  /** Server-derived only — never accepted from a client. */
  selectable: boolean;
}

export interface TemplateCatalogEntry {
  id: string;
  code: string;
  eventType: EventType;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  previewMediaPath: string | null;
  versions: TemplateVersionCatalogEntry[];
}

/** Raw (hardened row-shape, but manifest still unvalidated) catalog projection from the repository. */
export interface RawTemplateVersionRow {
  id: string;
  versionNumber: number;
  rendererKey: string;
  manifest: unknown;
  retiredAt: string | null;
}

export interface RawTemplateCatalogRow {
  id: string;
  code: string;
  eventType: EventType;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  previewMediaPath: string | null;
  versions: RawTemplateVersionRow[];
}
