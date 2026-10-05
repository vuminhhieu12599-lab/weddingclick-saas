import { isValidRsvpSubmitInputV1, type RsvpSubmitInputV1 } from "../../invitation-rendering/rsvp-capability";
import { hashAccessToken, isValidRawAccessTokenShape } from "../auth/access-token-crypto";
import { ApiError } from "../errors/api-error";
import type { PublicGuestRsvpGateway } from "../public-guest/public-guest-types";
import { isWellFormedPublicSlug } from "../public-invitation/load-public-invitation";
import type { PublicRsvpGateway } from "./public-rsvp-types";

/**
 * Task 033A — public RSVP submission use case (docs/DECISIONS.md "Task 033A
 * — Public RSVP Foundation"; docs/API_CONTRACT.md §20).
 *
 * The browser sends exactly `{ publicSlug, attendance, partySize, message,
 * guestName }`. The slug is a public routing locator, not authorization;
 * Project, invitation and version are derived server-side from the slug's
 * CURRENT PUBLISHED version inside the 0040 RPC. Any other key (project id,
 * invitation/version id, renderer key, guest id, token …) is rejected.
 *
 * The four response fields are re-validated with the canonical
 * `isValidRsvpSubmitInputV1` (K16; never normalized here). The typed
 * `guestName` is response/display data only: it is never used to look up,
 * create or update a guest or an existing RSVP. Every accepted submission is
 * the canonical non-personalized flow (`guest_id` NULL).
 *
 * Task 033B1 — personalized flow: the same body plus `guestToken` (the raw
 * token of /i/[slug]/g/[token]). The token is shape-checked and hashed here;
 * the 0042 RPC resolves it on the slug's current publication and derives
 * `guest_id` from it alone, then inserts or updates that guest's ONE current
 * RSVP. A malformed/unknown/other-Project token is 404 (never a silent
 * generic insert); a revoked guest is 410. The typed name stays response
 * data. `guestId`/`token`/`guest` keys remain rejected.
 */

const BODY_KEYS = ["publicSlug", "attendance", "partySize", "message", "guestName"] as const;
const PERSONALIZED_BODY_KEYS = [...BODY_KEYS, "guestToken"] as const;

export interface SubmitPublicRsvpDependencies {
  rsvps: PublicRsvpGateway;
  /** Task 033B1 personalized writes; absent → a personalized request fails (500), never a generic insert. */
  guestRsvps?: PublicGuestRsvpGateway;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(record);
  return ownKeys.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

/** Resolves only after the row is persisted; throws `ApiError` (400/404) or a generic error otherwise. */
export async function submitPublicRsvp(body: unknown, deps: SubmitPublicRsvpDependencies): Promise<void> {
  if (!isPlainRecord(body)) {
    throw new ApiError("BAD_REQUEST", "Invalid RSVP request");
  }
  const personalized = hasExactKeys(body, PERSONALIZED_BODY_KEYS);
  if (!personalized && !hasExactKeys(body, BODY_KEYS)) {
    throw new ApiError("BAD_REQUEST", "Invalid RSVP request");
  }
  const { publicSlug, attendance, partySize, message, guestName } = body;
  const input: unknown = { attendance, partySize, message, guestName };
  if (!isValidRsvpSubmitInputV1(input)) {
    throw new ApiError("BAD_REQUEST", "Invalid RSVP request");
  }
  if (typeof publicSlug !== "string" || !isWellFormedPublicSlug(publicSlug)) {
    throw new ApiError("NOT_FOUND", "Invitation not found");
  }

  const canonical: RsvpSubmitInputV1 = {
    attendance: input.attendance,
    partySize: input.partySize,
    message: input.message,
    guestName: input.guestName,
  };
  if (personalized) {
    const { guestToken } = body;
    if (typeof guestToken !== "string" || !isValidRawAccessTokenShape(guestToken)) {
      throw new ApiError("NOT_FOUND", "Invitation not found");
    }
    if (deps.guestRsvps === undefined) {
      throw new Error("Personalized RSVP gateway is not configured");
    }
    const guestRsvpId = await deps.guestRsvps.submitPublicGuestRsvp(publicSlug, hashAccessToken(guestToken), canonical);
    if (guestRsvpId === null) {
      throw new ApiError("NOT_FOUND", "Invitation not found");
    }
    return;
  }

  const rsvpId = await deps.rsvps.submitPublicRsvp(publicSlug, canonical);
  if (rsvpId === null) {
    throw new ApiError("NOT_FOUND", "Invitation not found");
  }
}
