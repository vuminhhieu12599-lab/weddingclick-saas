import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectLifecycleGateway } from "./project-lifecycle-gateway";
import type { TransitionStatusResult } from "./project-lifecycle-types";
import { validateTransitionStatusInput } from "./validate-transition-status-input";

/**
 * Transition-Project-Status use case (Task 025 Phase 2). Always calls the
 * `transition_project_status` RPC via the gateway — never a plain RLS
 * UPDATE — so the transition-graph check, no-op/reserved-target rejection,
 * payment precondition, and audited `PROJECT_STATUS_CHANGED`/
 * `PROJECT_ARCHIVED` activity log all happen atomically server-side. No
 * business-state check is duplicated here.
 */
export async function transitionProjectStatus<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectLifecycleGateway<TClient>,
): Promise<TransitionStatusResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const input = validateTransitionStatusInput(rawBody);

  return gateway.transitionStatus(staff.supabase, rawProjectId, input);
}
