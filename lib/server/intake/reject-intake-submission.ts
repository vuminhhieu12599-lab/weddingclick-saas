import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { IntakeStaffGateway } from "./intake-staff-gateway";
import type { RejectIntakeSubmissionResult } from "./intake-types";
import { validateRejectIntakeSubmissionInput } from "./validate-reject-intake-submission-input";

/**
 * Reject-Intake-Submission use case (Task 027 Phase 2 §5). Always calls the
 * `reject_intake_submission` RPC via the gateway — never a plain RLS UPDATE
 * (no longer even grantable, migration 0026). No Wedding Details mutation,
 * no activity mutation (frozen §5 — no rejection activity type exists).
 */
export async function rejectIntakeSubmission<TClient>(
  rawProjectId: string,
  rawSubmissionId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: IntakeStaffGateway<TClient>,
): Promise<RejectIntakeSubmissionResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  if (!isValidUuid(rawSubmissionId)) {
    throw new ApiError("BAD_REQUEST", "Submission id must be a valid UUID");
  }

  const staffNote = validateRejectIntakeSubmissionInput(rawBody);

  return gateway.rejectIntakeSubmission(staff.supabase, rawProjectId, rawSubmissionId, staffNote);
}
