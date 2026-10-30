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
 *
 * Still the only writer for a request that carries NO response key, so a
 * browser running an older cached bundle keeps submitting exactly as before
 * (RSVP-P0-03 changes nothing here).
 */
export interface PublicRsvpGateway {
  submitPublicRsvp(publicSlug: string, input: RsvpSubmitInputV1): Promise<string | null>;
}

/**
 * RSVP-P0-03 generic submit-or-correct seam: the service_role-only
 * `submit_public_rsvp_keyed` RPC (migration 0056). Same slug-derived
 * authorization and same non-personalized row shape as above, but one
 * atomic `INSERT ... ON CONFLICT DO UPDATE` on the response key's digest, so
 * the first submission from a mounted page inserts and every later
 * submission of that key — a correction, a retry, a double tap, two
 * concurrent requests — updates that SAME row.
 *
 * Resolves the persisted row id, or `null` when the slug is unknown or has
 * no publication (nothing written). A key that belongs to another
 * invitation or Project fails closed as `ApiError("NOT_FOUND")` with nothing
 * written; invalid input (including a key that is not a 32-byte digest) is
 * `ApiError("BAD_REQUEST")`; anything else rejects with a generic error
 * carrying no database detail. Only the digest is ever passed.
 */
export interface KeyedPublicRsvpGateway {
  submitKeyedPublicRsvp(
    publicSlug: string,
    responseKeyHash: Uint8Array,
    input: RsvpSubmitInputV1,
  ): Promise<string | null>;
}
