import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectEventsGateway } from "./project-events-gateway";
import type { ProjectEventRecord } from "./project-events-types";

/**
 * List-Project-Events-by-Project use case (Task 023, DIRECT RLS SELECT per
 * API_CONTRACT.md §3.1).
 *
 * A Project with no events yet returns an empty array (task §3 — "empty
 * Project events = 200 with []"). If the Project itself does not exist,
 * throws NOT_FOUND.
 */
export async function listProjectEventsByProjectId<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: ProjectEventsGateway<TClient>,
): Promise<ProjectEventRecord[]> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const exists = await gateway.projectExists(staff.supabase, rawProjectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  return gateway.listProjectEvents(staff.supabase, rawProjectId);
}
