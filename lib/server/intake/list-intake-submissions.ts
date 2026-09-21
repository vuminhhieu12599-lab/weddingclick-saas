import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { IntakeStaffGateway } from "./intake-staff-gateway";
import type { IntakeSubmissionRecord } from "./intake-types";

/**
 * List-Intake-Submissions-by-Project use case (Task 027 Phase 2 §3, DIRECT
 * RLS SELECT, mirrors list-project-events.ts). Returns every submission
 * (PENDING/APPLIED/REJECTED) for the Project, newest-first. A Project with
 * no submissions yet returns an empty array. If the Project itself does not
 * exist, throws NOT_FOUND.
 */
export async function listIntakeSubmissionsByProjectId<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: IntakeStaffGateway<TClient>,
): Promise<IntakeSubmissionRecord[]> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const exists = await gateway.projectExists(staff.supabase, rawProjectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  return gateway.listIntakeSubmissionsByProjectId(staff.supabase, rawProjectId);
}
