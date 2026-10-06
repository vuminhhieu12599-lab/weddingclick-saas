import type { PortalGuestToolDependencies } from "../customer-portal/portal-guest-tool";
import type { PortalGuestLinkGateway } from "../customer-portal/portal-guest-types";
import type { PublicGuestRsvpGateway } from "../public-guest/public-guest-types";
import type { AccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import { enforceResolvedTargetLimit } from "./rate-limit-guards";
import { accessLinkSubject, guestSubject, type RateLimitStore } from "./rate-limit-store";

/**
 * Task 035A post-resolution guards, injected through the frozen use cases'
 * existing dependency seams so no business logic changes:
 *
 * - Access links (REVIEW / INTAKE / PORTAL): the frozen resolver
 *   (resolve-access-link.ts, D4) calls `touchLastUsedAt(row.id)` ONLY after
 *   steps A–H passed (shape, hash lookup, purpose, project, revoked,
 *   expired). The guard runs right there, keyed on that resolved
 *   `accessLinkId`, before `last_used_at` is written and before the body is
 *   read. Malformed/unknown/wrong-purpose/revoked/expired tokens keep their
 *   frozen 404/410 and never reach the guard.
 * - Portal ISSUE/REGENERATE: keyed on the guest id only once the
 *   Project-pinned gateway confirmed that guest exists in the resolved
 *   Project (`getGuestLinkTarget` non-null), before any token rotation.
 * - Personalized RSVP: the 0042 RPC resolves and writes atomically and never
 *   returns the guest id, so a narrow server-side lookup
 *   (`PublicGuestIdentityGateway`) supplies the active guest's id. The guard
 *   runs only when it resolves; otherwise the frozen RPC produces its own
 *   404/410 unchanged. The guest id never leaves the server.
 */

export function withAccessLinkTargetLimit(
  repository: AccessLinkResolutionRepository,
  ruleId: "REVIEW_FEEDBACK_LINK" | "INTAKE_LINK" | "PORTAL_MUTATION_LINK",
  store: RateLimitStore,
): AccessLinkResolutionRepository {
  return {
    lookupByTokenHash: (tokenHash) => repository.lookupByTokenHash(tokenHash),
    async touchLastUsedAt(accessLinkId) {
      await enforceResolvedTargetLimit(store, ruleId, accessLinkSubject(accessLinkId));
      await repository.touchLastUsedAt(accessLinkId);
    },
  };
}

export function withGuestLinkMintLimit(gateway: PortalGuestLinkGateway, store: RateLimitStore): PortalGuestLinkGateway {
  return {
    hasPersonalizedGuestEntitlement: (client, projectId) => gateway.hasPersonalizedGuestEntitlement(client, projectId),
    async getGuestLinkTarget(client, projectId, guestId) {
      const target = await gateway.getGuestLinkTarget(client, projectId, guestId);
      if (target !== null) {
        await enforceResolvedTargetLimit(store, "GUEST_LINK_MINT_GUEST", guestSubject(guestId));
      }
      return target;
    },
    getInvitationSlug: (client, projectId, variant) => gateway.getInvitationSlug(client, projectId, variant),
    replaceGuestToken: (client, params) => gateway.replaceGuestToken(client, params),
  };
}

/** Portal guest create / edit / revoke: per-PORTAL-link guard. */
export function withPortalGuestMutationLimit(deps: PortalGuestToolDependencies, store: RateLimitStore): PortalGuestToolDependencies {
  return { ...deps, resolution: withAccessLinkTargetLimit(deps.resolution, "PORTAL_MUTATION_LINK", store) };
}

/**
 * Portal ISSUE / REGENERATE: per-guest guard only (owner decision) — one
 * customer may legitimately mint links for many different guests.
 */
export function withPortalGuestLinkMintLimit(deps: PortalGuestToolDependencies, store: RateLimitStore): PortalGuestToolDependencies {
  return { ...deps, guestLinks: withGuestLinkMintLimit(deps.guestLinks, store) };
}

/** Server-only: the id of the ACTIVE guest owning this token hash, or `null`. Never returned to a caller. */
export interface PublicGuestIdentityGateway {
  findActiveGuestIdByTokenHash(tokenHash: Uint8Array): Promise<string | null>;
}

export function withPersonalizedRsvpGuestLimit(
  gateway: PublicGuestRsvpGateway,
  identities: PublicGuestIdentityGateway,
  store: RateLimitStore,
): PublicGuestRsvpGateway {
  return {
    async submitPublicGuestRsvp(publicSlug, tokenHash, input) {
      const guestId = await identities.findActiveGuestIdByTokenHash(tokenHash);
      if (guestId !== null) {
        await enforceResolvedTargetLimit(store, "GUEST_RSVP_GUEST", guestSubject(guestId));
      }
      return gateway.submitPublicGuestRsvp(publicSlug, tokenHash, input);
    },
  };
}
