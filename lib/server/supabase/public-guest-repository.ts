import { ApiError } from "../errors/api-error";
import type { PublicGuestGateway, PublicGuestRsvpGateway } from "../public-guest/public-guest-types";
import { isValidUuid } from "../validation/uuid";
import { toPostgresByteaHexLiteral } from "./postgres-bytea";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Production, service_role-backed personalized-guest gateways (Task 033B1).
 * Exactly two capabilities — the 0042 RPCs `get_public_guest_invitation`
 * (read-only) and `submit_public_guest_rsvp` — which resolve (slug, token
 * hash) to one active guest of the Project the slug currently PUBLISHES. No
 * table access, no Storage, no generic `.rpc()` passthrough. Isolated from
 * every other service_role module; a fresh client per call. Only the token
 * HASH is sent. Nothing is logged; no slug, hash, name or database detail
 * reaches an error message.
 */

const INVALID_INPUT_CODE = "RS001";
const REVOKED_GUEST_CODE = "GT001";
const DISPLAY_NAME_MAX_LENGTH = 200;

export function toPublicGuest(data: unknown): { displayName: string } | null {
  if (data === null) {
    return null;
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Unexpected result shape from the database");
  }
  const keys = Object.keys(data);
  const displayName = (data as Record<string, unknown>).displayName;
  if (
    keys.length !== 1 ||
    typeof displayName !== "string" ||
    displayName.length === 0 ||
    [...displayName].length > DISPLAY_NAME_MAX_LENGTH
  ) {
    throw new Error("Unexpected result shape from the database");
  }
  return { displayName };
}

export function getServiceRolePublicGuestGateway(): PublicGuestGateway {
  return {
    async getPublicGuest(publicSlug, tokenHash) {
      const client = createServiceRoleSupabaseClient();
      const { data, error } = await client.rpc("get_public_guest_invitation", {
        p_public_slug: publicSlug,
        p_token_hash: toPostgresByteaHexLiteral(tokenHash),
      });
      if (error) {
        throw new Error("Failed to resolve guest");
      }
      return toPublicGuest(data);
    },
  };
}

export function getServiceRolePublicGuestRsvpGateway(): PublicGuestRsvpGateway {
  return {
    async submitPublicGuestRsvp(publicSlug, tokenHash, input) {
      const client = createServiceRoleSupabaseClient();
      const { data, error } = await client.rpc("submit_public_guest_rsvp", {
        p_public_slug: publicSlug,
        p_token_hash: toPostgresByteaHexLiteral(tokenHash),
        p_attendance: input.attendance,
        p_party_size: input.partySize,
        p_message: input.message,
        p_guest_name: input.guestName,
      });
      if (error) {
        if (error.code === INVALID_INPUT_CODE) {
          throw new ApiError("BAD_REQUEST", "Invalid RSVP request");
        }
        if (error.code === REVOKED_GUEST_CODE) {
          throw new ApiError("REVOKED_TOKEN", "Invitation link is no longer valid");
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
