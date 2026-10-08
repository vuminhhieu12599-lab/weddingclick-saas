import type { TemplateEditorManifestV1 } from "../../../templates/core/editor-manifest";
import type { StaffContext } from "../auth/staff-context";
import { validateTemplateDesignManifest } from "../project-design/validate-template-design-manifest";
import type { TemplatesGateway } from "./templates-gateway";
import type { TemplateCatalogEntry } from "./templates-types";

/**
 * List-Templates use case (Task 028, DIRECT RLS SELECT). Returns the
 * complete catalog — active and inactive template families, retired and
 * non-retired versions (Task 028 closure §10 T28-D8) — ordering
 * (`sort_order ASC, id ASC` / `version_number ASC, id ASC`) is the
 * repository's responsibility.
 *
 * `selectable` is computed here, server-side only, never accepted from a
 * client. Event type is deliberately NOT factored into `selectable` — this
 * route has no Project context to compare against; PUT /design remains the
 * real event-type compatibility authority.
 *
 * A malformed design-manifest subset on ANY version fails the whole
 * request (fail-closed, never silently accepted) — the plain Error thrown
 * by validateTemplateDesignManifest propagates to the route's generic
 * INTERNAL/500 mapping.
 *
 * TE-05A: each version also carries `editorManifest`, from the injected
 * exact-key production editor registry lookup (never the DB manifest).
 */
export async function listTemplates<TClient>(
  staff: StaffContext<TClient>,
  gateway: TemplatesGateway<TClient>,
  lookupEditorManifest: (rendererKey: string) => TemplateEditorManifestV1 | undefined,
): Promise<TemplateCatalogEntry[]> {
  const rawTemplates = await gateway.listTemplatesWithVersions(staff.supabase);

  return rawTemplates.map((template) => ({
    id: template.id,
    code: template.code,
    eventType: template.eventType,
    name: template.name,
    description: template.description,
    isActive: template.isActive,
    sortOrder: template.sortOrder,
    previewMediaPath: template.previewMediaPath,
    versions: template.versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      rendererKey: version.rendererKey,
      designManifest: validateTemplateDesignManifest(version.manifest),
      editorManifest: lookupEditorManifest(version.rendererKey) ?? null,
      retiredAt: version.retiredAt,
      selectable: template.isActive === true && version.retiredAt === null,
    })),
  }));
}
