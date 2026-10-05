import type { RsvpSubmitInputV1 } from "../../invitation-rendering/rsvp-capability";

/**
 * Task 033A public RSVP write seam. Exactly one capability: the
 * service_role-only `submit_public_rsvp` RPC (migration 0040), which binds
 * the response to the Project of the invitation the slug CURRENTLY
 * publishes and inserts one non-personalized `rsvps` row.
 *
 * Resolves the persisted row id (server-only; never sent to the browser) or
 * `null` when the slug is unknown or has no publication (nothing written).
 * Invalid input is an `ApiError("BAD_REQUEST")`; anything else rejects with
 * a generic error carrying no database detail.
 */
export interface PublicRsvpGateway {
  submitPublicRsvp(publicSlug: string, input: RsvpSubmitInputV1): Promise<string | null>;
}
