/**
 * Task 033B1 — canonical personalized invitation path: `/i/[slug]/g/[token]`.
 * The raw token is the credential; the slug is only a routing locator. Never
 * `?guest=`, never a guest id or name.
 */
export function buildPersonalizedInvitationPath(publicSlug: string, rawToken: string): string {
  return `/i/${publicSlug}/g/${rawToken}`;
}
