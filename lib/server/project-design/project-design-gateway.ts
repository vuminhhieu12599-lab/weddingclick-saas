import type {
  ProjectDesignRecord,
  ProjectForDesign,
  SaveProjectDesignInput,
  TemplateForDesign,
  TemplateVersionForDesign,
} from "./project-design-types";

/**
 * Small seam (Task 028, mirrors Task 022's WeddingDetailsGateway pattern)
 * that decouples Project Design use cases from the real
 * @supabase/supabase-js client shape.
 *
 * Every method here is a plain DIRECT RLS read/write (API_CONTRACT.md §8:
 * "project_design get/upsert" — no activity type exists for design changes
 * in the frozen Activity Union, so this is never a trusted-RPC business
 * action) — always called with a staff-scoped client so `projects`/
 * `templates`/`template_versions`/`project_design` RLS (`is_staff()`)
 * remains the real enforcement. No elevated-access (service-role) credential,
 * no RPC anywhere in this feature.
 */
export interface ProjectDesignGateway<TClient> {
  getProjectForDesign(client: TClient, projectId: string): Promise<ProjectForDesign | null>;
  getCurrentProjectDesign(
    client: TClient,
    projectId: string,
  ): Promise<ProjectDesignRecord | null>;
  getTemplateVersionForDesign(
    client: TClient,
    templateVersionId: string,
  ): Promise<TemplateVersionForDesign | null>;
  getTemplateForDesign(client: TClient, templateId: string): Promise<TemplateForDesign | null>;
  upsertProjectDesign(
    client: TClient,
    projectId: string,
    input: SaveProjectDesignInput,
  ): Promise<ProjectDesignRecord>;
}
