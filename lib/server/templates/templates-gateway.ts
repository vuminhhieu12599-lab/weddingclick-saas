import type { RawTemplateCatalogRow } from "./templates-types";

/**
 * Small seam (Task 028) that decouples the template catalog use case from
 * the real @supabase/supabase-js client shape. Plain DIRECT RLS SELECT
 * (`is_staff()`) — catalog reads never require an elevated-access (service-role) credential or admin.
 *
 * Returns hardened row-shape data with `manifest` still raw/unvalidated —
 * manifest extraction into TemplateDesignManifestV1 is a use-case-layer
 * concern (list-templates.ts), shared with the project-design save path via
 * validate-template-design-manifest.ts.
 */
export interface TemplatesGateway<TClient> {
  listTemplatesWithVersions(client: TClient): Promise<RawTemplateCatalogRow[]>;
}
