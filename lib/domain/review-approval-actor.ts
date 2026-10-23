/**
 * TE-06 — who recorded an approval, and how it was confirmed.
 *
 * Mirrors the additive `review_feedback` columns of migration 0053
 * (`actor_type`, `approval_channel`), frozen in docs/DECISIONS.md "TE-01
 * T12" as corrected by "TE-03A" item 5. The database remains the authority:
 * `review_feedback_actor_evidence_check` enforces the two legal row shapes
 * and `staff_confirm_review_approval` is the only writer of a STAFF row.
 */

/** `review_feedback.actor_type` CHECK (0053). Every pre-0053 row is `CUSTOMER`. */
export const REVIEW_FEEDBACK_ACTOR_TYPES = ["CUSTOMER", "STAFF"] as const;

export type ReviewFeedbackActorType = (typeof REVIEW_FEEDBACK_ACTOR_TYPES)[number];

/**
 * `review_feedback.approval_channel` CHECK (0053): how the customer
 * confirmed the approval that staff then recorded. Required on a STAFF row,
 * always NULL on a CUSTOMER row — the customer's own approval needs no
 * channel evidence, because the REVIEW link itself is the evidence.
 */
export const APPROVAL_CHANNELS = ["ZALO", "PHONE", "IN_PERSON", "OTHER"] as const;

export type ApprovalChannel = (typeof APPROVAL_CHANNELS)[number];

export function isApprovalChannel(value: unknown): value is ApprovalChannel {
  return typeof value === "string" && (APPROVAL_CHANNELS as readonly string[]).includes(value);
}

/** The internal staff note is `review_feedback.staff_note` (0053), never `message`. */
export const STAFF_APPROVAL_NOTE_MAX_LENGTH = 2000;
