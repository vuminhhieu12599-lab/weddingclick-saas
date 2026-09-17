import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectEventsGateway } from "./project-events-gateway";
import type { CreateProjectEventResult } from "./project-events-types";
import { validateProjectEventInput } from "./validate-project-event-input";

/**
 * Create-Project-Event use case (Task 023, TRUSTED BUSINESS ACTION per
 * API_CONTRACT.md §3.1). Always calls the `create_project_event` RPC via the
 * gateway — never a plain RLS INSERT — so the atomic audited insert +
 * `CANONICAL_DATA_APPLIED` activity log both happen server-side in one
 * transaction (API_CONTRACT.md §3.1, §7).
 */
export async function createProjectEvent<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectEventsGateway<TClient>,
): Promise<CreateProjectEventResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const input = validateProjectEventInput(rawBody);

  return gateway.createProjectEvent(staff.supabase, rawProjectId, input);
}
