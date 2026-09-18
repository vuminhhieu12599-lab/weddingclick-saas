import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectLifecycleGateway } from "./project-lifecycle-gateway";
import type { ReassignStaffResult } from "./project-lifecycle-types";
import { validateReassignStaffInput } from "./validate-reassign-staff-input";

/**
 * Reassign-Project-Staff use case (Task 025 Phase 2). Always calls the
 * `reassign_project_staff` RPC via the gateway — never a plain RLS UPDATE —
 * so the same-assignment conflict, the active-STAFF/ADMIN assignee
 * invariant, and the audited `STAFF_ASSIGNMENT_CHANGED` activity log all
 * happen atomically server-side. No assignee active-profile precheck is
 * duplicated here.
 */
export async function reassignProjectStaff<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectLifecycleGateway<TClient>,
): Promise<ReassignStaffResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const input = validateReassignStaffInput(rawBody);

  return gateway.reassignStaff(staff.supabase, rawProjectId, input);
}
