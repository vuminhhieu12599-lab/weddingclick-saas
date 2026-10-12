import { PRODUCTION_COMPATIBILITY_REGISTRY } from "../../../templates/core/production-renderer-manifests";
import { getServiceRolePublicInvitationAliasGateway } from "../supabase/public-invitation-alias-repository";
import { getServiceRolePublicInvitationGateway } from "../supabase/public-invitation-repository";
import { createServiceRolePublishedInvitationMediaSigner } from "../supabase/published-invitation-media-signer";
import type { LoadPublicInvitationRouteDependencies } from "./resolve-public-invitation-route";

/**
 * Production wiring for the Task 032A public invitation page. Built per
 * request (no module-scope client or secret). The two service_role-backed
 * pieces stay separate: the read-only 0039 RPC and PUBLISHED INVITATION
 * MEDIA SIGNING ONLY. LAUNCH-P0-02 adds the read-only 0049 alias resolver.
 * Imported only by app/i/[slug]/page.tsx.
 */
export function createPublicInvitationPageDependencies(): LoadPublicInvitationRouteDependencies {
  return {
    aliases: getServiceRolePublicInvitationAliasGateway(),
    invitations: getServiceRolePublicInvitationGateway(),
    signMedia: createServiceRolePublishedInvitationMediaSigner(),
    rendererRegistry: PRODUCTION_COMPATIBILITY_REGISTRY.compatibility,
  };
}
