import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { WeddingDetailsGateway } from "./wedding-details-gateway";
import type { WeddingDetailsRecord } from "./wedding-details-types";

/**
 * Get-Wedding-Details-by-Project use case (Task 022, DIRECT RLS SELECT per
 * API_CONTRACT.md §3.1).
 *
 * If the Project exists but has no wedding_details row yet, returns `null`
 * (§3 of the task spec — a Project may exist before intake completes). If
 * the Project itself does not exist, throws NOT_FOUND.
 */
export async function getWeddingDetailsByProjectId<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: WeddingDetailsGateway<TClient>,
): Promise<WeddingDetailsRecord | null> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const exists = await gateway.projectExists(staff.supabase, rawProjectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  return gateway.getWeddingDetailsByProjectId(staff.supabase, rawProjectId);
}
