import type { RsvpAttendanceStatus } from "../domain";
import {
  RSVP_ATTENDING_PARTY_SIZE_MAX,
  RSVP_ATTENDING_PARTY_SIZE_MIN,
  RSVP_GUEST_NAME_MAX_LENGTH,
  RSVP_MESSAGE_MAX_LENGTH,
  RSVP_SUBMIT_RESULT_STATUSES,
  isValidRsvpSubmitInputV1,
  type RsvpCapabilityV1,
  type RsvpSubmitInputV1,
  type RsvpSubmitResultStatusV1,
} from "./rsvp-capability";

/**
 * Shared renderer RSVP form model (docs/DECISIONS.md RF-05 K15–K18,
 * "RF-06-0 …" P31–P33, "VH-02B-E1").
 *
 * Pure and framework-free: no React, no storage, no network. It turns a
 * local form draft into exactly the frozen `RsvpSubmitInputV1`, owns the
 * P32 presentation state machine, settles one capability submission and
 * guards against duplicate submits. Any renderer RSVP island may use it;
 * presentation (copy, markup, CSS) stays in the renderer. Local validation
 * is UX prevalidation only: the capability stays authoritative (K16), and
 * nothing here ever means "submitted".
 *
 * Elegant Editorial v1 keeps its own byte-identical copy of this logic
 * (`interactive/rsvp-model.ts`, `interactive/rsvp.tsx`); moving it onto this
 * module is recorded technical debt for a separately approved task.
 */

/** Ascending ATTENDING / MAYBE party-size choices, straight from the K16 range. */
export const RSVP_PARTY_SIZE_CHOICES: readonly number[] = Object.freeze(
  Array.from(
    { length: RSVP_ATTENDING_PARTY_SIZE_MAX - RSVP_ATTENDING_PARTY_SIZE_MIN + 1 },
    (_, index) => RSVP_ATTENDING_PARTY_SIZE_MIN + index,
  ),
);

export { RSVP_GUEST_NAME_MAX_LENGTH, RSVP_MESSAGE_MAX_LENGTH };

/** Statuses that take the 1–20 party-size choice (ATTENDING and MAYBE). */
export function rsvpTakesPartySize(attendance: RsvpAttendanceStatus | null): boolean {
  return attendance === "ATTENDING" || attendance === "MAYBE";
}

/** The editable form fields. Never prefilled from a stored response (K18). */
export interface RsvpDraft {
  readonly attendance: RsvpAttendanceStatus | null;
  readonly partySize: number;
  readonly message: string;
  readonly guestName: string;
}

/** Empty name, attendance preselected on `ATTENDING` (the Task 029 "Sẽ tham dự" default), party of 1. */
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
 * Builds the frozen four-field input from the draft (K15, K16):
 *
 * - `attendance`: required; `ATTENDING`, `MAYBE` or `NOT_ATTENDING`;
 * - `partySize`: the chosen integer 1–20 for `ATTENDING` / `MAYBE`, exactly 0
 *   for `NOT_ATTENDING`;
 * - `message`: `null` when blank after trim, otherwise exactly as typed, at
 *   most 500 code points;
 * - `guestName`: required, sent trimmed; display data only, never identity.
 *
 * The result is finally checked with the frozen `isValidRsvpSubmitInputV1`,
 * so this model can never produce an input the contract rejects.
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
 * Idle → pending → success / invalid / unavailable / failed (P32). A start
 * while pending, or after success, is ignored; a settlement outside pending
 * is ignored. After any non-success result the user may submit again.
 * `EDIT` is a local return from success to the form (never a K18 prefill);
 * any resubmission goes through the capability again.
 */
export function rsvpPhaseReducer(phase: RsvpPhase, action: RsvpPhaseAction): RsvpPhase {
  if (action.type === "EDIT") return phase === "SUCCESS" ? "IDLE" : phase;
  if (action.type === "SUBMIT_STARTED") {
    return phase === "PENDING" || phase === "SUCCESS" ? phase : "PENDING";
  }
  return phase === "PENDING" ? rsvpPhaseForOutcome(action.outcome) : phase;
}

// ---------------------------------------------------------------------------
// One capability submission + duplicate-submit gate
// ---------------------------------------------------------------------------

function isRsvpSubmitResultStatus(value: unknown): value is RsvpSubmitResultStatusV1 {
  return (RSVP_SUBMIT_RESULT_STATUSES as readonly unknown[]).includes(value);
}

/**
 * Submits once through the frozen RSVP capability (K15, K17, K18). Resolves
 * the capability's own status; an unexpected rejection becomes `REJECTED`
 * (never success, never an unhandled rejection), and a malformed result is
 * `FAILED`. Nothing is stored or sent anywhere else.
 */
export async function settleRsvpSubmit(rsvp: RsvpCapabilityV1, input: RsvpSubmitInputV1): Promise<RsvpSubmitOutcome> {
  try {
    const result: unknown = await rsvp.submit(input);
    const status: unknown =
      typeof result === "object" && result !== null ? (result as { status?: unknown }).status : undefined;
    return isRsvpSubmitResultStatus(status) ? status : "FAILED";
  } catch {
    return "REJECTED";
  }
}

export interface RsvpSubmissionGate {
  /** Starts a submission, or returns `null` while one is still in flight. */
  run(rsvp: RsvpCapabilityV1, input: RsvpSubmitInputV1): Promise<RsvpSubmitOutcome> | null;
}

/**
 * P32 duplicate-submission guard. Synchronous, so repeated clicks or Enter
 * presses before React rerenders can never start a parallel request. It is
 * released once the submission settles, so an explicit retry is possible.
 */
export function createRsvpSubmissionGate(): RsvpSubmissionGate {
  let inFlight = false;
  return Object.freeze({
    run(rsvp: RsvpCapabilityV1, input: RsvpSubmitInputV1): Promise<RsvpSubmitOutcome> | null {
      if (inFlight) return null;
      inFlight = true;
      return settleRsvpSubmit(rsvp, input).finally(() => {
        inFlight = false;
      });
    },
  });
}
