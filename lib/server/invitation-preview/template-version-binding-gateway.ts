import type { SnapshotTemplateVersionSource } from "../../invitation-rendering/snapshot-payload-types";

/**
 * Small seam (mirrors ProjectDesignGateway) for the one read the staff
 * preview needs beyond the existing design loaders: the exact
 * `template_versions.renderer_key` of the version a Project design pins.
 * Always called with a staff-scoped client, so `template_versions` RLS
 * (`is_staff()`) remains the real enforcement — never an elevated credential.
 */
export interface TemplateVersionBindingGateway<TClient> {
  /**
   * The exact version row by id, or `null` when no row is visible. Never a
   * "latest", default or alias version. A query failure or malformed row
   * throws.
   */
  getTemplateVersionBinding(client: TClient, templateVersionId: string): Promise<SnapshotTemplateVersionSource | null>;
}
