import type { PublicGuestIdentityGateway } from "../rate-limit/post-resolution-guards";
import { isValidUuid } from "../validation/uuid";
import { toPostgresByteaHexLiteral } from "./postgres-bytea";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Task 035A — service_role lookup used ONLY by the personalized-RSVP
 * per-guest limiter (lib/server/rate-limit/post-resolution-guards.ts). The
 * 0042 `submit_public_guest_rsvp` RPC resolves and writes atomically and by
 * design never returns the guest id, so the limiter needs this one narrow
 * read: `guests.id` of the ACTIVE guest whose `token_hash` matches
 * (UNIQUE(token_hash), 0017). Selects only `id`; never the display name,
 * hint, contact fields or notes. Writes nothing; no Storage; no RPC. The
 * result stays server-side as a limiter key — the RPC remains the sole
 * authority for slug/Project/variant binding and the frozen 404/410.
 * A fresh client per call. Nothing is logged; no hash or database detail
 * reaches an error message.
 */
export function getServiceRolePublicGuestIdentityGateway(): PublicGuestIdentityGateway {
  return {
    async findActiveGuestIdByTokenHash(tokenHash) {
      const client = createServiceRoleSupabaseClient();
      const { data, error } = await client
        .from("guests")
        .select("id")
        .eq("token_hash", toPostgresByteaHexLiteral(tokenHash))
        .is("revoked_at", null)
        .maybeSingle();
      if (error) {
        throw new Error("Failed to resolve guest");
      }
      if (data === null) {
        return null;
      }
      const id: unknown = (data as Record<string, unknown>).id;
      if (typeof id !== "string" || !isValidUuid(id)) {
        throw new Error("Unexpected result shape from the database");
      }
      return id;
    },
  };
}
