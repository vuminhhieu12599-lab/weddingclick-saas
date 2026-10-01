import type { RsvpAttendanceStatus } from "../../../../../lib/domain";
import {
  RSVP_ATTENDING_PARTY_SIZE_MAX,
  RSVP_ATTENDING_PARTY_SIZE_MIN,
  RSVP_GUEST_NAME_MAX_LENGTH,
  RSVP_MESSAGE_MAX_LENGTH,
  isValidRsvpSubmitInputV1,
  type RsvpSubmitInputV1,
  type RsvpSubmitResultStatusV1,
} from "../../../../../lib/invitation-rendering/rsvp-capability";

/**
 * Elegant Editorial v1 — RF-06D RSVP form model (docs/DECISIONS.md RF-05
 * K15–K18; "RF-06-0 …" P31–P33).
 *
 * Pure and deterministic: no React, no capability call, no storage, no
 * network. It turns the local form draft into exactly the frozen
 * `RsvpSubmitInputV1` and owns the P32 presentation state machine. Local
 * validation is UX prevalidation only: the capability stays authoritative
 * (K16), and nothing here ever means "submitted".
 */

/** Ascending ATTENDING / MAYBE party-size choices, straight from the K16 range. */
export const RSVP_PARTY_SIZE_CHOICES: readonly number[] = Object.freeze(
  Array.from(
    { length: RSVP_ATTENDING_PARTY_SIZE_MAX - RSVP_ATTENDING_PARTY_SIZE_MIN + 1 },
    (_, index) => RSVP_ATTENDING_PARTY_SIZE_MIN + index,
  ),
);

export { RSVP_GUEST_NAME_MAX_LENGTH, RSVP_MESSAGE_MAX_LENGTH };

/** Statuses that take the 1–20 party-size select (ATTENDING and MAYBE). */
export function rsvpTakesPartySize(attendance: RsvpAttendanceStatus | null): boolean {
  return attendance === "ATTENDING" || attendance === "MAYBE";
}

/**
 * The editable form fields. There is no current-RSVP prefill (K18): the
 * draft never comes from a stored response. `attendance` is nullable for
 * prevalidation, but the Task029 attendance select starts on "Sẽ tham dự"
 * (`ATTENDING`), exactly as the approved Task029 form does (Design Baseline
 * B5 item 16); the guest changes it explicitly.
 */
export interface RsvpDraft {
  readonly attendance: RsvpAttendanceStatus | null;
  readonly partySize: number;
  readonly message: string;
  readonly guestName: string;
}

export const INITIAL_RSVP_DRAFT: RsvpDraft = Object.freeze({
  attendance: "ATTENDING",
  partySize: RSVP_ATTENDING_PARTY_SIZE_MIN,
  message: "",
  guestName: "",
});

export type RsvpDraftError =
  | "ATTENDANCE_REQUIRED"
  | "GUEST_NAME_REQUIRED"
  | "PARTY_SIZE_RANGE"
  | "MESSAGE_TOO_LONG"
  | "INPUT_REJECTED";

export type RsvpDraftResult =
  | { readonly ok: true; readonly input: RsvpSubmitInputV1 }
  | { readonly ok: false; readonly errors: readonly RsvpDraftError[] };

/** Unicode code points, the unit of the frozen 500-character rule (PostgreSQL `char_length`). */
export function rsvpMessageLength(message: string): number {
  return Array.from(message).length;
}

/**
 * Builds the frozen four-field input from the draft (K15, K16, P31):
 *
 * - `attendance`: required; `ATTENDING`, `MAYBE` or `NOT_ATTENDING`;
 * - `partySize`: the chosen integer 1–20 for `ATTENDING` / `MAYBE`, exactly 0
 *   for `NOT_ATTENDING` (which has no party-size input);
 * - `message`: `null` when blank after trim, otherwise the text exactly as
 *   typed, at most 500 code points;
 * - `guestName` (RSVP completion amendment): the typed response name, for
 *   personalized and unpersonalized invitations alike, required, sent
 *   trimmed. Display data only, never identity (the capability carries the
 *   secure guest context itself).
 *
 * Nothing else is normalized. The result is finally checked with the frozen
 * canonical `isValidRsvpSubmitInputV1`, so this model can never produce an
 * input the contract rejects.
 */
export function buildRsvpSubmitInput(draft: RsvpDraft): RsvpDraftResult {
  const errors: RsvpDraftError[] = [];
  if (draft.guestName.trim().length === 0) errors.push("GUEST_NAME_REQUIRED");
  if (draft.attendance === null) errors.push("ATTENDANCE_REQUIRED");
  if (
    rsvpTakesPartySize(draft.attendance) &&
    (!Number.isInteger(draft.partySize) ||
      draft.partySize < RSVP_ATTENDING_PARTY_SIZE_MIN ||
      draft.partySize > RSVP_ATTENDING_PARTY_SIZE_MAX)
  ) {
    errors.push("PARTY_SIZE_RANGE");
  }
  if (rsvpMessageLength(draft.message) > RSVP_MESSAGE_MAX_LENGTH) errors.push("MESSAGE_TOO_LONG");
  if (errors.length > 0 || draft.attendance === null) return { ok: false, errors };

  const input: RsvpSubmitInputV1 = {
    attendance: draft.attendance,
    partySize: rsvpTakesPartySize(draft.attendance) ? draft.partySize : 0,
    message: draft.message.trim().length === 0 ? null : draft.message,
    guestName: draft.guestName.trim(),
  };
  if (!isValidRsvpSubmitInputV1(input)) return { ok: false, errors: ["INPUT_REJECTED"] };
  return { ok: true, input };
}

// ---------------------------------------------------------------------------
// P32 presentation state machine
// ---------------------------------------------------------------------------

/** A settled submission: the four frozen K17 statuses, or an unexpected rejection. */
export type RsvpSubmitOutcome = RsvpSubmitResultStatusV1 | "REJECTED";

export type RsvpPhase = "IDLE" | "PENDING" | RsvpSubmitResultStatusV1;

export type RsvpPhaseAction =
  | { readonly type: "SUBMIT_STARTED" }
  | { readonly type: "SUBMIT_SETTLED"; readonly outcome: RsvpSubmitOutcome }
  | { readonly type: "EDIT" };

/** K18/P32: a rejected promise is shown as failure, never as success. */
export function rsvpPhaseForOutcome(outcome: RsvpSubmitOutcome): RsvpSubmitResultStatusV1 {
  return outcome === "REJECTED" ? "FAILED" : outcome;
}

/**
 * Idle → pending → success / invalid / unavailable / failed (P32).
 * A start while pending, or after success, is ignored (no duplicate or
 * post-success submission); a settlement outside pending is ignored. After
 * any non-success result the user may explicitly submit again.
 *
 * `EDIT` is the Design Baseline D11 "Sửa lại" action: a local return from
 * success to the form (never a K18 prefill from a stored response). Any
 * resubmission goes through the capability again. It changes nothing in
 * any other phase.
 */
export function rsvpPhaseReducer(phase: RsvpPhase, action: RsvpPhaseAction): RsvpPhase {
  if (action.type === "EDIT") return phase === "SUCCESS" ? "IDLE" : phase;
  if (action.type === "SUBMIT_STARTED") {
    return phase === "PENDING" || phase === "SUCCESS" ? phase : "PENDING";
  }
  return phase === "PENDING" ? rsvpPhaseForOutcome(action.outcome) : phase;
}
