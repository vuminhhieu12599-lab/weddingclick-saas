import { ApiError } from "../errors/api-error";
import type { PublicRsvpGateway } from "../public-rsvp/public-rsvp-types";
import { isValidUuid } from "../validation/uuid";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Production, service_role-backed PublicRsvpGateway (Task 033A). Exposes
 * exactly one capability — the `submit_public_rsvp` RPC of migration 0040,
 * which re-validates the input, resolves the slug to its CURRENT PUBLISHED
 * version and inserts one non-personalized `rsvps` row for that Project. No
 * table access (`.from`), no Storage access, no generic `.rpc()`
 * passthrough, and no read of existing RSVPs. Isolated from every other
 * service_role module. A fresh client per call; nothing cached at module
 * scope. RS001 (invalid input) maps to BAD_REQUEST; every other RPC error
 * (including the PI001 integrity fault) is a generic failure with no
 * database detail. Nothing is logged here: no slug, name or message.
 */

const INVALID_INPUT_CODE = "RS001";

export function toPublicRsvpId(data: unknown): string | null {
  if (data === null) {
    return null;
  }
  if (typeof data !== "string" || !isValidUuid(data)) {
    throw new Error("Unexpected result shape from the database");
  }
  return data;
}

export function getServiceRolePublicRsvpGateway(): PublicRsvpGateway {
  return {
    async submitPublicRsvp(publicSlug, input) {
      const client = createServiceRoleSupabaseClient();
      const { data, error } = await client.rpc("submit_public_rsvp", {
        p_public_slug: publicSlug,
        p_attendance: input.attendance,
        p_party_size: input.partySize,
        p_message: input.message,
        p_guest_name: input.guestName,
      });
      if (error) {
        if (error.code === INVALID_INPUT_CODE) {
          throw new ApiError("BAD_REQUEST", "Invalid RSVP request");
        }
        throw new Error("Failed to submit RSVP");
      }
      return toPublicRsvpId(data);
    },
  };
}
