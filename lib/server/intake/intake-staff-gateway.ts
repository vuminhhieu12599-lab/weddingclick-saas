import type {
  ApplyIntakeSubmissionResult,
  IntakeSubmissionRecord,
  RejectIntakeSubmissionResult,
} from "./intake-types";

/**
 * Narrow seam (Task 027 Phase 2, mirrors ProjectEventsGateway/
 * WeddingDetailsGateway) that decouples the staff read/apply/reject use
 * cases from the real @supabase/supabase-js client shape.
 *
 * `projectExists`/`listIntakeSubmissionsByProjectId`/`getIntakeSubmissionById`
 * are plain DIRECT RLS reads (frozen Task 027 Phase 2 contract §3) — called
 * with a staff-scoped client so `projects`/`intake_submissions` RLS
 * (`is_staff()`) remains the real enforcement. `applyIntakeSubmission`/
 * `rejectIntakeSubmission` each call exactly one of the two migration-0026
 * staff TRUSTED BUSINESS ACTION RPCs — never a plain RLS UPDATE (which is no
 * longer even grantable — migration 0026 revokes `authenticated`'s UPDATE
 * outright).
 *
 * This gateway is never backed by the service_role client — see
 * lib/server/intake/intake-submit-gateway.ts for the separate,
 * service-role-backed PUBLIC submit path.
 */
export interface IntakeStaffGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  listIntakeSubmissionsByProjectId(
    client: TClient,
    projectId: string,
  ): Promise<IntakeSubmissionRecord[]>;
  getIntakeSubmissionById(
    client: TClient,
    projectId: string,
    submissionId: string,
  ): Promise<IntakeSubmissionRecord | null>;
  applyIntakeSubmission(
    client: TClient,
    projectId: string,
    submissionId: string,
  ): Promise<ApplyIntakeSubmissionResult>;
  rejectIntakeSubmission(
    client: TClient,
    projectId: string,
    submissionId: string,
    staffNote: string | null,
  ): Promise<RejectIntakeSubmissionResult>;
}
