import { RSVP_ATTENDANCE_STATUSES, type RsvpAttendanceStatus } from "../domain";

/**
 * Invitation Rendering Foundation RF-05A — RSVP renderer/action capability
 * contract (docs/DECISIONS.md "RF-05 Shared Renderer Boundary / Minimum
 * Shared Client Capabilities Contract Clarification" K15–K20).
 *
 * Interface and canonical input validation only. Persistence, the endpoint
 * and guest authorization stay later integration (K2, K20): nothing here
 * carries a token, guest id or `?guest=` identity.
 */

/** K16 / docs/PHYSICAL_DATABASE_PLAN.md §2.20: ATTENDING and MAYBE party size range (0032). */
export const RSVP_ATTENDING_PARTY_SIZE_MIN = 1;
export const RSVP_ATTENDING_PARTY_SIZE_MAX = 20;

/**
 * RSVP completion amendment: maximum typed response-name length in Unicode
 * code points, the same bound as `guests.display_name` (§2.19).
 */
export const RSVP_GUEST_NAME_MAX_LENGTH = 200;

/** K16 / §2.20 `CHECK`: maximum message length in characters (PostgreSQL `char_length`). */
export const RSVP_MESSAGE_MAX_LENGTH = 500;

/** K15: exactly these four fields. `null`, never `undefined`, means "no value". */
export interface RsvpSubmitInputV1 {
  readonly attendance: RsvpAttendanceStatus;
  readonly partySize: number;
  readonly message: string | null;
  /**
   * RSVP completion amendment: the typed response name, required for every
   * submission (personalized or not), already trimmed, non-blank, at most
   * 200 code points. Display data only: NEVER guest identity, which comes
   * solely from the secure guest context the capability carries itself.
   */
  readonly guestName: string;
}

/** K17: exactly four outcomes. */
export const RSVP_SUBMIT_RESULT_STATUSES = ["SUCCESS", "INVALID", "UNAVAILABLE", "FAILED"] as const;

export type RsvpSubmitResultStatusV1 = (typeof RSVP_SUBMIT_RESULT_STATUSES)[number];

/** K17: status-only discriminated union; v1 freezes no extra payload on any outcome. */
export type RsvpSubmitResultV1 = {
  [S in RsvpSubmitResultStatusV1]: { readonly status: S };
}[RsvpSubmitResultStatusV1];

/**
 * K15, K17. Expected business/runtime failures resolve to `INVALID`,
 * `UNAVAILABLE` or `FAILED`; unexpected faults may reject. Never resolves a
 * fake `SUCCESS`. Implementations must re-validate input (K16).
 */
export interface RsvpCapabilityV1 {
  submit(input: RsvpSubmitInputV1): Promise<RsvpSubmitResultV1>;
}

const RSVP_SUBMIT_INPUT_KEYS = [
  "attendance",
  "partySize",
  "message",
  "guestName",
] as const satisfies readonly (keyof RsvpSubmitInputV1)[];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Exactly the four input keys as own properties, and nothing else (string or symbol). */
function hasExactInputKeys(record: Record<string, unknown>): boolean {
  const ownKeys = Reflect.ownKeys(record);
  return (
    ownKeys.length === RSVP_SUBMIT_INPUT_KEYS.length &&
    RSVP_SUBMIT_INPUT_KEYS.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  );
}

function isRsvpAttendanceStatus(value: unknown): value is RsvpAttendanceStatus {
  return (RSVP_ATTENDANCE_STATUSES as readonly unknown[]).includes(value);
}

function isValidPartySize(attendance: RsvpAttendanceStatus, partySize: unknown): boolean {
  if (typeof partySize !== "number" || !Number.isInteger(partySize)) return false;
  // ATTENDING and MAYBE share the 1–20 range (0032); NOT_ATTENDING is exactly 0.
  if (attendance === "NOT_ATTENDING") return partySize === 0;
  return partySize >= RSVP_ATTENDING_PARTY_SIZE_MIN && partySize <= RSVP_ATTENDING_PARTY_SIZE_MAX;
}

/** Unicode code points, matching PostgreSQL `char_length` rather than UTF-16 units. */
function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isValidMessage(message: unknown): boolean {
  if (message === null) return true;
  return typeof message === "string" && codePointLength(message) <= RSVP_MESSAGE_MAX_LENGTH;
}

/** Required for every submission: already trimmed, non-blank, at most 200 code points. */
function isValidGuestName(guestName: unknown): boolean {
  return (
    typeof guestName === "string" &&
    guestName.length > 0 &&
    guestName === guestName.trim() &&
    codePointLength(guestName) <= RSVP_GUEST_NAME_MAX_LENGTH
  );
}

/**
 * K16 canonical RSVP input validation (RSVP completion amendment). Pure:
 * never normalizes, trims, mutates or throws for invalid input. The same
 * rules apply to personalized and unpersonalized invitations: the name is
 * required for both and is never used as identity.
 */
export function isValidRsvpSubmitInputV1(input: unknown): input is RsvpSubmitInputV1 {
  if (!isPlainRecord(input) || !hasExactInputKeys(input)) return false;
  const { attendance, partySize, message, guestName } = input;
  return (
    isRsvpAttendanceStatus(attendance) &&
    isValidPartySize(attendance, partySize) &&
    isValidMessage(message) &&
    isValidGuestName(guestName)
  );
}
