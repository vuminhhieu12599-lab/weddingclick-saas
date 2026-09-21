import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { IntakeStaffGateway } from "./intake-staff-gateway";
import type { IntakeSubmissionRecord } from "./intake-types";

/**
 * Get-Intake-Submission-by-Id use case (Task 027 Phase 2 §3, DIRECT RLS
 * SELECT). A submission id that does not exist, or that exists but belongs
 * to a different Project, both resolve to the same NOT_FOUND outcome — no
 * cross-project leakage of "the submission exists, just not here" (frozen
 * §3: "wrong-project binding must behave as NOT_FOUND").
 */
export async function getIntakeSubmissionById<TClient>(
  rawProjectId: string,
  rawSubmissionId: string,
  staff: StaffContext<TClient>,
  gateway: IntakeStaffGateway<TClient>,
): Promise<IntakeSubmissionRecord> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  if (!isValidUuid(rawSubmissionId)) {
    throw new ApiError("BAD_REQUEST", "Submission id must be a valid UUID");
  }

  const exists = await gateway.projectExists(staff.supabase, rawProjectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const record = await gateway.getIntakeSubmissionById(
    staff.supabase,
    rawProjectId,
    rawSubmissionId,
  );

  if (!record) {
    throw new ApiError("NOT_FOUND", "Intake submission not found");
  }

  return record;
}
