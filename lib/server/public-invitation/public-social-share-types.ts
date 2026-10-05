/**
 * Task 032B — the CURRENT effective SOCIAL_SHARE_COVER of a published
 * invitation's Project, already signed for this one request. Server-only
 * metadata input: never part of the Snapshot, the InvitationViewModel, the
 * PUBLISHED media pins or any renderer. The URL is runtime-only and never
 * persisted or logged.
 */
export interface SignedSocialShareCover {
  url: string;
  width: number | null;
  height: number | null;
  altText: string | null;
}

/**
 * Task 032B public read seam. Exactly one capability: resolve the slug's
 * effective SOCIAL_SHARE_COVER through the service_role-only 0041 RPC and
 * sign exactly that one storage object. `null` = unknown/unpublished slug,
 * no cover chosen, or a non-image row (no fallback to COVER, ever).
 */
export interface PublicSocialShareCoverGateway {
  getSignedSocialShareCover(publicSlug: string): Promise<SignedSocialShareCover | null>;
}
