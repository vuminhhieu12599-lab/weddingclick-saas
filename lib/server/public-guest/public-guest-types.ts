import type { RsvpSubmitInputV1 } from "../../invitation-rendering/rsvp-capability";

/**
 * Task 033B1 public personalized-guest seams. Both are backed only by the
 * service_role-exclusive 0042 RPCs and take the SHA-256 hash of the
 * presented token — the raw token never leaves the server process.
 */

/** `get_public_guest_invitation`: the active guest's display name, or `null` (any unresolved/mismatched/revoked case). */
export interface PublicGuestGateway {
  getPublicGuest(publicSlug: string, tokenHash: Uint8Array): Promise<{ displayName: string } | null>;
}

/**
 * `submit_public_guest_rsvp`: inserts or updates the guest's ONE current RSVP.
 * Resolves the row id, or `null` when the slug/token does not resolve
 * (nothing written). Revoked guest → `ApiError("REVOKED_TOKEN")`; invalid
 * input → `ApiError("BAD_REQUEST")`; anything else a generic error.
 */
export interface PublicGuestRsvpGateway {
  submitPublicGuestRsvp(publicSlug: string, tokenHash: Uint8Array, input: RsvpSubmitInputV1): Promise<string | null>;
}
