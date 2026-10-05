import { hashAccessToken, isValidRawAccessTokenShape } from "../auth/access-token-crypto";
import { isWellFormedPublicSlug, loadPublicInvitation, type LoadPublicInvitationDependencies } from "../public-invitation/load-public-invitation";
import type { PublicInvitationView } from "../public-invitation/public-invitation-types";
import type { PublicGuestGateway } from "./public-guest-types";

export interface LoadPersonalizedPublicInvitationDependencies extends LoadPublicInvitationDependencies {
  guests: PublicGuestGateway;
}

/**
 * Task 033B1 — personalized public invitation `/i/[slug]/g/[token]`.
 *
 *   slug + token shape (format only) → SHA-256(token)
 *   → `get_public_guest_invitation` (0042: same currently-PUBLISHED slug,
 *     same Project, permitted variant, active guest)
 *   → the unchanged Task 032A PUBLISHED pipeline with the guest's canonical
 *     `display_name` as the authorized ViewModel overlay.
 *
 * `null` for every failure of the credential or the slug — malformed,
 * unknown, rotated-away, revoked, other-Project or wrong-variant token —
 * so the page renders the same not-found. It NEVER falls back to the generic
 * invitation. The raw token is used only to compute the hash here.
 */
export async function loadPersonalizedPublicInvitation(
  publicSlug: string,
  rawToken: string,
  deps: LoadPersonalizedPublicInvitationDependencies,
): Promise<PublicInvitationView | null> {
  if (!isWellFormedPublicSlug(publicSlug) || !isValidRawAccessTokenShape(rawToken)) {
    return null;
  }
  const guest = await deps.guests.getPublicGuest(publicSlug, hashAccessToken(rawToken));
  if (guest === null) {
    return null;
  }
  return loadPublicInvitation(publicSlug, deps, { displayName: guest.displayName });
}
