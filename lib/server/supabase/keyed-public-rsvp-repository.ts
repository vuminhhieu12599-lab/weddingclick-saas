import { ApiError } from "../errors/api-error";
import type { KeyedPublicRsvpGateway } from "../public-rsvp/public-rsvp-types";
import { isValidUuid } from "../validation/uuid";
import { toPostgresByteaHexLiteral } from "./postgres-bytea";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Production, service_role-backed KeyedPublicRsvpGateway (RSVP-P0-03).
 * Exposes exactly one capability — the `submit_public_rsvp_keyed` RPC of
 * migration 0056, which re-validates the input, resolves the slug to its
 * CURRENT PUBLISHED version and performs ONE atomic
 * `INSERT ... ON CONFLICT DO UPDATE` so the response key owns exactly one
 * non-personalized `rsvps` row. No table access (`.from`), no Storage
 * access, no generic `.rpc()` passthrough, and no read of existing RSVPs.
 * Isolated from every other service_role module — deliberately a separate
 * file from public-rsvp-repository.ts, which stays the 0040-only writer. A
 * fresh client per call; nothing cached at module scope.
 *
 * Only the key's SHA-256 digest is sent, as a BYTEA hex literal. RS001
 * (invalid input, including a key that is not 32 bytes) maps to BAD_REQUEST;
 * RK001 (the key belongs to another invitation or Project — nothing was
 * written) maps to NOT_FOUND, the same fail-closed answer an unknown slug
 * gets; every other RPC error (including the PI001 integrity fault) is a
 * generic failure with no database detail. Nothing is logged here: no slug,
 * key, hash, name or message.
 */

const INVALID_INPUT_CODE = "RS001";
const FOREIGN_RESPONSE_KEY_CODE = "RK001";

export function getServiceRoleKeyedPublicRsvpGateway(): KeyedPublicRsvpGateway {
  return {
    async submitKeyedPublicRsvp(publicSlug, responseKeyHash, input) {
      const client = createServiceRoleSupabaseClient();
      const { data, error } = await client.rpc("submit_public_rsvp_keyed", {
        p_public_slug: publicSlug,
        p_response_key_hash: toPostgresByteaHexLiteral(responseKeyHash),
        p_attendance: input.attendance,
        p_party_size: input.partySize,
        p_message: input.message,
        p_guest_name: input.guestName,
      });
      if (error) {
        if (error.code === INVALID_INPUT_CODE) {
          throw new ApiError("BAD_REQUEST", "Invalid RSVP request");
        }
        if (error.code === FOREIGN_RESPONSE_KEY_CODE) {
          throw new ApiError("NOT_FOUND", "Invitation not found");
        }
        throw new Error("Failed to submit RSVP");
      }
      if (data === null) {
        return null;
      }
      if (typeof data !== "string" || !isValidUuid(data)) {
        throw new Error("Unexpected result shape from the database");
      }
      return data;
    },
  };
}
