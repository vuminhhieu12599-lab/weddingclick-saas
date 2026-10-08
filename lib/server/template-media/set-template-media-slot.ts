import type { TemplateEditorManifestV1 } from "../../../templates/core/editor-manifest";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import type { TemplateVersionBindingGateway } from "../invitation-preview/template-version-binding-gateway";
import type { ProjectDesignGateway } from "../project-design/project-design-gateway";
import type { ProjectGateway } from "../projects/project-gateway";
import { isValidUuid } from "../validation/uuid";
import type { TemplateMediaSlotGateway } from "./template-media-slot-gateway";
import {
  TEMPLATE_MEDIA_SLOT_KEY_PATTERN,
  TEMPLATE_MEDIA_SLOT_MAX_ITEMS,
  type TemplateMediaSlotItem,
} from "./template-media-slot-types";

/**
 * TE-03B — replace one template media slot (docs/DECISIONS.md "TE-03B").
 *
 * The application owns the template-specific contract; the database owns
 * structural integrity. Nothing template-specific is trusted from the
 * caller: the renderer key, media model, slot list, cardinality and
 * maxCount are derived only from
 *   Project → current project_design.template_version_id
 *           → that exact template_versions.renderer_key
 *           → lookupEditorManifest(rendererKey).
 * The caller's `templateVersionId` is only the compare-and-set expectation
 * of which version Staff are editing; it must equal the current design.
 * The RPC re-checks the current version, ownership and media type.
 */
export interface SetTemplateMediaSlotDependencies<TClient> {
  readonly projects: Pick<ProjectGateway<TClient>, "getProjectById">;
  readonly design: Pick<ProjectDesignGateway<TClient>, "getCurrentProjectDesign">;
  readonly templateVersions: TemplateVersionBindingGateway<TClient>;
  readonly slots: TemplateMediaSlotGateway<TClient>;
  /** Exact-key lookup; `undefined` for an unregistered renderer (no fallback). */
  readonly lookupEditorManifest: (rendererKey: string) => TemplateEditorManifestV1 | undefined;
}

export interface SetTemplateMediaSlotInput {
  readonly templateVersionId: string;
  readonly slotKey: string;
  readonly projectMediaIds: readonly string[];
}

const ACCEPTED_FIELDS = ["templateVersionId", "slotKey", "projectMediaIds"] as const;

/** Shape-only validation of the untrusted body: exact keys, UUIDs, key pattern, no duplicates. */
export function validateSetTemplateMediaSlotInput(body: unknown): SetTemplateMediaSlotInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== ACCEPTED_FIELDS.length || !keys.every((key) => (ACCEPTED_FIELDS as readonly string[]).includes(key))) {
    throw new ApiError("BAD_REQUEST", "Request body must have exactly templateVersionId, slotKey and projectMediaIds");
  }
  const { templateVersionId, slotKey, projectMediaIds } = record;
  if (typeof templateVersionId !== "string" || !isValidUuid(templateVersionId)) {
    throw new ApiError("BAD_REQUEST", "templateVersionId must be a valid UUID");
  }
  if (typeof slotKey !== "string" || !TEMPLATE_MEDIA_SLOT_KEY_PATTERN.test(slotKey)) {
    throw new ApiError("BAD_REQUEST", "slotKey is not a valid slot key");
  }
  if (!Array.isArray(projectMediaIds) || projectMediaIds.length > TEMPLATE_MEDIA_SLOT_MAX_ITEMS) {
    throw new ApiError("BAD_REQUEST", "projectMediaIds must be an array of at most 500 ids");
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of projectMediaIds as unknown[]) {
    if (typeof id !== "string" || !isValidUuid(id)) {
      throw new ApiError("BAD_REQUEST", "projectMediaIds must contain only valid UUIDs");
    }
    const identity = id.toLowerCase();
    if (seen.has(identity)) {
      throw new ApiError("BAD_REQUEST", "The same photo cannot appear twice in one slot");
    }
    seen.add(identity);
    ids.push(id);
  }
  return { templateVersionId, slotKey, projectMediaIds: ids };
}

export async function setTemplateMediaSlot<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  deps: SetTemplateMediaSlotDependencies<TClient>,
): Promise<TemplateMediaSlotItem[]> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const input = validateSetTemplateMediaSlotInput(rawBody);
  const client = staff.supabase;

  const project = await deps.projects.getProjectById(client, rawProjectId);
  if (project === null) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const design = await deps.design.getCurrentProjectDesign(client, rawProjectId);
  if (design === null) {
    throw new ApiError("CONFLICT", "Project design is not configured");
  }
  if (design.templateVersionId !== input.templateVersionId) {
    throw new ApiError("CONFLICT", "Project template version changed; reload and try again");
  }

  const binding = await deps.templateVersions.getTemplateVersionBinding(client, design.templateVersionId);
  if (binding === null) {
    throw new Error("Pinned template version is not readable");
  }

  const manifest = deps.lookupEditorManifest(binding.rendererKey);
  if (manifest === undefined) {
    throw new ApiError("INVARIANT", "Selected template version has no editor manifest");
  }
  if (manifest.mediaModel !== "TEMPLATE_SLOTS") {
    throw new ApiError("INVARIANT", "Selected template version does not use template media slots");
  }

  const slot = manifest.mediaSlots.find((candidate) => candidate.key === input.slotKey);
  if (slot === undefined) {
    throw new ApiError("INVARIANT", "Slot does not exist for the selected template version");
  }
  const count = input.projectMediaIds.length;
  if (slot.cardinality === "SINGLE" && count > 1) {
    throw new ApiError("INVARIANT", "This slot holds at most one photo");
  }
  if (slot.maxCount !== null && count > slot.maxCount) {
    throw new ApiError("INVARIANT", "Too many photos for this slot");
  }

  return deps.slots.replaceSlot(client, {
    projectId: rawProjectId,
    templateVersionId: design.templateVersionId,
    slotKey: slot.key,
    projectMediaIds: input.projectMediaIds,
  });
}
