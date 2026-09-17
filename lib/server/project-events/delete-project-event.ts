import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectEventsGateway } from "./project-events-gateway";

/**
 * Delete-Project-Event use case (Task 023, TRUSTED BUSINESS ACTION per
 * API_CONTRACT.md §3.1). Always calls the `delete_project_event` RPC via the
 * gateway — never a plain RLS DELETE — so the atomic audited delete +
 * `CANONICAL_DATA_APPLIED` activity log both happen server-side in one
 * transaction (API_CONTRACT.md §3.1, §7 — deletion is always meaningful and
 * always audited).
 */
export async function deleteProjectEvent<TClient>(
  rawProjectId: string,
  rawEventId: string,
  staff: StaffContext<TClient>,
  gateway: ProjectEventsGateway<TClient>,
): Promise<void> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  if (!isValidUuid(rawEventId)) {
    throw new ApiError("BAD_REQUEST", "Event id must be a valid UUID");
  }

  await gateway.deleteProjectEvent(staff.supabase, rawProjectId, rawEventId);
}
