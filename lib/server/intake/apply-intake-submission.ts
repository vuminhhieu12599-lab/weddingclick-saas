import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { IntakeStaffGateway } from "./intake-staff-gateway";
import type { ApplyIntakeSubmissionResult } from "./intake-types";

/**
 * Apply-Intake-Submission use case (Task 027 Phase 2 §4). Always calls the
 * `apply_intake_submission` RPC via the gateway — never a plain RLS UPDATE
 * (no longer even grantable, migration 0026) — so the PENDING-only guard,
 * canonical wedding_details apply (via Task 022 composition), and terminal
 * transition all happen server-side in one transaction.
 *
 * Frozen no-body contract (§4): this use case takes no request body at all
 * — the stored immutable submission snapshot is the only apply source.
 */
export async function applyIntakeSubmission<TClient>(
  rawProjectId: string,
  rawSubmissionId: string,
  staff: StaffContext<TClient>,
  gateway: IntakeStaffGateway<TClient>,
): Promise<ApplyIntakeSubmissionResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  if (!isValidUuid(rawSubmissionId)) {
    throw new ApiError("BAD_REQUEST", "Submission id must be a valid UUID");
  }

  return gateway.applyIntakeSubmission(staff.supabase, rawProjectId, rawSubmissionId);
}
