import type { IntakeSubmissionStatus } from "../../domain";
import type { SaveWeddingDetailsInput } from "../wedding-details/wedding-details-types";

/**
 * Intake Workflow domain shapes (Task 027 Phase 2).
 *
 * Mirrors migration 0015_intake_submissions.sql / migration
 * 0026_intake_actions.sql exactly — no invented fields. The request body for
 * PUBLIC SUBMIT and the stored `payload` snapshot both mechanically reuse
 * Task 022's `SaveWeddingDetailsInput` (lib/server/wedding-details/
 * wedding-details-types.ts) — never a divergent second Wedding Details
 * field model (frozen Task 027 Phase 2 contract §2.2/§9).
 */

/**
 * Narrow success result of `submit_intake_submission` — never the stored
 * payload, never token/link material. `status` is the literal `"PENDING"`
 * (Task 027 Phase 2 Independent Review Patch 1, Finding B) — a fresh
 * submission is never created in any other state, so the repository layer
 * treats any other returned status as an unexpected/failed mutation result,
 * never as a differently-shaped success.
 */
export interface SubmitIntakeSubmissionResult {
  id: string;
  projectId: string;
  status: "PENDING";
  submittedAt: string;
}

/**
 * Staff-facing intake submission record (list/detail DTOs). Deliberately
 * excludes token/token_hash/token_hint/service-role details — `accessLinkId`
 * itself is safe to expose to staff (unlike the public submit response,
 * which never returns it at all).
 */
export interface IntakeSubmissionRecord {
  id: string;
  projectId: string;
  accessLinkId: string | null;
  status: IntakeSubmissionStatus;
  submittedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  staffNote: string | null;
  weddingDetails: SaveWeddingDetailsInput;
}

/**
 * Narrow success result of `apply_intake_submission`. `status` is the
 * literal `"APPLIED"` (Finding B) — apply's only successful terminal state.
 */
export interface ApplyIntakeSubmissionResult {
  id: string;
  projectId: string;
  status: "APPLIED";
  reviewedBy: string;
  reviewedAt: string;
  weddingDetailsChanged: boolean;
}

/**
 * Narrow success result of `reject_intake_submission`. `status` is the
 * literal `"REJECTED"` (Finding B) — reject's only successful terminal state.
 */
export interface RejectIntakeSubmissionResult {
  id: string;
  projectId: string;
  status: "REJECTED";
  reviewedBy: string;
  reviewedAt: string;
  staffNote: string | null;
}
