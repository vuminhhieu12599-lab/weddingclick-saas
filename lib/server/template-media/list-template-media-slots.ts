import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { TemplateMediaSlotGateway } from "./template-media-slot-gateway";
import type { TemplateMediaSlotItem } from "./template-media-slot-types";

/**
 * TE-03B — read the draft slot assignments of one Project + one exact
 * template version (any version, current or not: assignments are retained
 * per version). Deterministic order: slotKey, then position. No URLs.
 */
export async function listTemplateMediaSlots<TClient>(
  rawProjectId: string,
  rawTemplateVersionId: string,
  staff: StaffContext<TClient>,
  slots: TemplateMediaSlotGateway<TClient>,
): Promise<TemplateMediaSlotItem[]> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  if (!isValidUuid(rawTemplateVersionId)) {
    throw new ApiError("BAD_REQUEST", "Template version id must be a valid UUID");
  }
  return slots.listSlotItems(staff.supabase, rawProjectId, rawTemplateVersionId);
}
