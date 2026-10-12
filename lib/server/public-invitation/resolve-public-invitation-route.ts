import { isWellFormedInvitationPublicAlias } from "../../domain";
import { isWellFormedPublicSlug, loadPublicInvitation, type LoadPublicInvitationDependencies } from "./load-public-invitation";
import type { PublicInvitationView } from "./public-invitation-types";

/**
 * LAUNCH-P0-02 public alias seam: exactly the service_role-only
 * `resolve_public_invitation_alias` RPC (0049). Returns the bound
 * invitation's canonical `public_slug` only while it has a valid PUBLISHED
 * pointer; `null` otherwise.
 */
export interface PublicInvitationAliasGateway {
  resolvePublicSlug(alias: string): Promise<string | null>;
}

export interface LoadPublicInvitationRouteDependencies extends LoadPublicInvitationDependencies {
  aliases: PublicInvitationAliasGateway;
}

/**
 * The `/i/[slug]` segment as received. Next decodes params, but a shared
 * link may still carry `%26` for `&`; one strict decode is tolerated, a
 * malformed escape is not-found.
 */
function decodeSegment(segment: string): string | null {
  if (!segment.includes("%")) return segment;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Route segment → canonical public slug. Two disjoint shapes:
 * - canonical slug (0012, no `&`) → itself, unchanged behavior;
 * - friendly alias (`name&name`, 0049) → the alias RPC.
 * Anything else is `null` without a database read.
 */
export async function resolvePublicInvitationRouteSlug(segment: string, aliases: PublicInvitationAliasGateway): Promise<string | null> {
  const value = decodeSegment(segment);
  if (value === null) return null;
  if (isWellFormedPublicSlug(value)) return value;
  if (!isWellFormedInvitationPublicAlias(value)) return null;
  const slug = await aliases.resolvePublicSlug(value);
  return slug !== null && isWellFormedPublicSlug(slug) ? slug : null;
}

/**
 * `/i/[slug]` use case: resolve the segment to the canonical slug, then the
 * unchanged Task 032A `loadPublicInvitation`. The page renders at its own
 * address (no redirect); the returned `publicSlug` is what RSVP and the
 * share-cover read bind to, exactly as for the canonical link.
 */
export async function loadPublicInvitationByRoute(
  segment: string,
  deps: LoadPublicInvitationRouteDependencies,
): Promise<{ publicSlug: string; view: PublicInvitationView } | null> {
  const publicSlug = await resolvePublicInvitationRouteSlug(segment, deps.aliases);
  if (publicSlug === null) return null;
  const view = await loadPublicInvitation(publicSlug, deps);
  return view === null ? null : { publicSlug, view };
}
