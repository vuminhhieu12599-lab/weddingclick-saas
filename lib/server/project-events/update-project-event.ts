import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectEventsGateway } from "./project-events-gateway";
import type { UpdateProjectEventResult } from "./project-events-types";
import { validateProjectEventInput } from "./validate-project-event-input";

/**
 * Update-Project-Event use case (Task 023, TRUSTED BUSINESS ACTION per
 * API_CONTRACT.md §3.1). Always calls the `update_project_event` RPC via the
 * gateway — never a plain RLS UPDATE — so the atomic audited update + no-op
 * detection + `CANONICAL_DATA_APPLIED` activity log all happen server-side
 * in one transaction (API_CONTRACT.md §3.1, §7).
 */
export async function updateProjectEvent<TClient>(
  rawProjectId: string,
  rawEventId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectEventsGateway<TClient>,
): Promise<UpdateProjectEventResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  if (!isValidUuid(rawEventId)) {
    throw new ApiError("BAD_REQUEST", "Event id must be a valid UUID");
  }

  const input = validateProjectEventInput(rawBody);

  return gateway.updateProjectEvent(staff.supabase, rawProjectId, rawEventId, input);
}
