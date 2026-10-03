import type { ProjectStatus } from "./project-status";
import type { ReviewFeedbackType } from "./review-feedback-type";

/**
 * Task 030B review lifecycle (Product Owner decisions, docs/DECISIONS.md
 * "Task 030B — Customer Review, Approval and Review Status Lifecycle").
 * TypeScript mirror of the private `review_outcome_for_project()` helper in
 * migration 0037, which is the authority that actually sets
 * `projects.status`; this mirror only feeds read models and UI.
 */

/** Review state of ONE review version, from that version's own feedback rows. */
export type ReviewVersionState = "AWAITING_FEEDBACK" | "REVISION_REQUESTED" | "APPROVED";

/** The three project statuses the review lifecycle can produce. */
export type ReviewOutcomeStatus = Extract<ProjectStatus, "CUSTOMER_REVIEW" | "REVISION_REQUIRED" | "APPROVED">;

/** Project statuses in which a customer may submit review feedback (0037 RV017). */
export const CUSTOMER_FEEDBACK_OPEN_STATUSES: readonly ProjectStatus[] = Object.freeze([
  "CUSTOMER_REVIEW",
  "REVISION_REQUIRED",
  "APPROVED",
]);

/**
 * A REVISION_REQUEST means the version still requires replacement by a new
 * review, so it outranks an APPROVAL on the same version (owner precedence).
 */
export function reviewVersionStateOf(feedbackTypes: readonly ReviewFeedbackType[]): ReviewVersionState {
  if (feedbackTypes.includes("REVISION_REQUEST")) {
    return "REVISION_REQUESTED";
  }
  if (feedbackTypes.includes("APPROVAL")) {
    return "APPROVED";
  }
  return "AWAITING_FEEDBACK";
}

/**
 * Owner precedence over the REQUIRED variants' CURRENT review states
 * (`null` = that variant has no current review yet):
 *   1. any REVISION_REQUESTED          -> REVISION_REQUIRED
 *   2. else every variant APPROVED     -> APPROVED
 *   3. else                            -> CUSTOMER_REVIEW
 * An empty list (unknown package policy) is never APPROVED.
 */
export function deriveReviewOutcome(currentStates: readonly (ReviewVersionState | null)[]): ReviewOutcomeStatus {
  if (currentStates.includes("REVISION_REQUESTED")) {
    return "REVISION_REQUIRED";
  }
  if (currentStates.length > 0 && currentStates.every((state) => state === "APPROVED")) {
    return "APPROVED";
  }
  return "CUSTOMER_REVIEW";
}
