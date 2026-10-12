import type { PublicInvitationAliasGateway } from "../public-invitation/resolve-public-invitation-route";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Production PublicInvitationAliasGateway (LAUNCH-P0-02). Exactly one
 * capability: the read-only, service_role-only `resolve_public_invitation_alias`
 * RPC (0049). No table access, no generic `.rpc()` passthrough, nothing
 * cached at module scope. Any RPC error (including PI001) is a generic
 * failure; no database detail is surfaced.
 */
export function getServiceRolePublicInvitationAliasGateway(): PublicInvitationAliasGateway {
  return {
    async resolvePublicSlug(alias) {
      const client = createServiceRoleSupabaseClient();
      const { data, error } = await client.rpc("resolve_public_invitation_alias", { p_alias: alias });
      if (error) {
        throw new Error("Failed to resolve public invitation alias");
      }
      if (data === null) return null;
      if (typeof data !== "string" || data.length === 0) {
        throw new Error("Unexpected result shape from the database");
      }
      return data;
    },
  };
}
