import type { TemplateEditorManifestV1 } from "../../../templates/core/editor-manifest";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectDesignGateway } from "./project-design-gateway";
import type { ProjectDesignRecord } from "./project-design-types";
import { validateDesignConfigAgainstManifest } from "./validate-design-config-against-manifest";
import { validateSaveProjectDesignInput } from "./validate-save-project-design-input";
import { validateTemplateDesignManifest } from "./validate-template-design-manifest";

/**
 * Save-Project-Design use case (Task 028, DIRECT RLS UPSERT per
 * API_CONTRACT.md §8 — no activity type exists for design changes in the
 * frozen Activity Union, so this is never a trusted-RPC business action).
 *
 * Ordering (Task 028 closure §8/§11) — validate shape -> read Project ->
 * read current design -> read requested template version -> read parent
 * template -> validate the persisted design-manifest subset -> event-type
 * compatibility -> retired/inactive selection rule (grandfathering an
 * unchanged templateVersionId) -> validate config against the manifest ->
 * upsert -> return.
 *
 * TE-05A-H1: a NEW selection additionally requires the requested version's
 * exact stored `renderer_key` (read from the DB row, never the body) to be a
 * registered production renderer — `lookupEditorManifest` is the TE-02
 * exact-key registry (no fallback, alias, "latest" or normalization). An
 * unchanged `templateVersionId` stays grandfathered exactly like a retired
 * version, so this can never become a path to switch to an unsupported
 * renderer.
 */
export async function saveProjectDesign<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectDesignGateway<TClient>,
  lookupEditorManifest: (rendererKey: string) => TemplateEditorManifestV1 | undefined,
): Promise<ProjectDesignRecord> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const input = validateSaveProjectDesignInput(rawBody);

  const project = await gateway.getProjectForDesign(staff.supabase, rawProjectId);
  if (!project) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const existingDesign = await gateway.getCurrentProjectDesign(staff.supabase, rawProjectId);

  const templateVersion = await gateway.getTemplateVersionForDesign(
    staff.supabase,
    input.templateVersionId,
  );
  if (!templateVersion) {
    throw new ApiError("NOT_FOUND", "Template version not found");
  }

  const template = await gateway.getTemplateForDesign(
    staff.supabase,
    templateVersion.templateId,
  );
  if (!template) {
    // Structurally unreachable under normal operation — template_versions
    // .template_id is REFERENCES templates(id) ON DELETE RESTRICT — a
    // missing parent row here means an unexpected DB/data-integrity state,
    // not a legitimate NOT_FOUND (the client never supplies templateId).
    throw new Error("Template version references a missing parent template");
  }

  // Throws a plain Error (-> generic INTERNAL/500) on any malformed
  // required design-manifest field. Never echoes the raw manifest.
  const designManifest = validateTemplateDesignManifest(templateVersion.manifest);

  if (template.eventType !== project.eventType) {
    throw new ApiError(
      "INVARIANT",
      "Selected template is not compatible with this Project's event type",
    );
  }

  const isUnchangedSelection =
    existingDesign !== null && existingDesign.templateVersionId === input.templateVersionId;

  if (!isUnchangedSelection) {
    const selectable =
      template.isActive === true &&
      templateVersion.retiredAt === null &&
      lookupEditorManifest(templateVersion.rendererKey) !== undefined;
    if (!selectable) {
      throw new ApiError(
        "INVARIANT",
        "Selected template version is not available for new selection",
      );
    }
  }

  validateDesignConfigAgainstManifest(input, designManifest);

  return gateway.upsertProjectDesign(staff.supabase, rawProjectId, input);
}
