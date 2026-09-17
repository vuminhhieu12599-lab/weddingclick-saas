import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { MediaGateway } from "./media-gateway";
import type { ProjectMediaRecord } from "./media-types";

/**
 * List-Project-Media use case (Task 024 Phase 3, DIRECT RLS SELECT per
 * API_CONTRACT.md §3.2 — no RPC, no activity log). A Project with no media
 * yet returns an empty array. If the Project itself does not exist, throws
 * NOT_FOUND. Mirrors list-project-events.ts exactly.
 */
export async function listProjectMedia<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: MediaGateway<TClient>,
): Promise<ProjectMediaRecord[]> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const exists = await gateway.projectExists(staff.supabase, rawProjectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  return gateway.listProjectMedia(staff.supabase, rawProjectId);
}
