import { isValidRsvpSubmitInputV1, type RsvpSubmitInputV1 } from "../../invitation-rendering/rsvp-capability";
import { ApiError } from "../errors/api-error";
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
 */

const BODY_KEYS = ["publicSlug", "attendance", "partySize", "message", "guestName"] as const;

export interface SubmitPublicRsvpDependencies {
  rsvps: PublicRsvpGateway;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactBodyKeys(record: Record<string, unknown>): boolean {
  const ownKeys = Reflect.ownKeys(record);
  return ownKeys.length === BODY_KEYS.length && BODY_KEYS.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

/** Resolves only after the row is persisted; throws `ApiError` (400/404) or a generic error otherwise. */
export async function submitPublicRsvp(body: unknown, deps: SubmitPublicRsvpDependencies): Promise<void> {
  if (!isPlainRecord(body) || !hasExactBodyKeys(body)) {
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
  const rsvpId = await deps.rsvps.submitPublicRsvp(publicSlug, canonical);
  if (rsvpId === null) {
    throw new ApiError("NOT_FOUND", "Invitation not found");
  }
}
