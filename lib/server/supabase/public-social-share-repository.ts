import { PROJECT_MEDIA_BUCKET } from "../media/media-constants";
import type { PublicSocialShareCoverGateway, SignedSocialShareCover } from "../public-invitation/public-social-share-types";
import { createServiceRoleSupabaseClient } from "./service-role-client";
import { RUNTIME_MEDIA_SIGNED_URL_TTL_SECONDS } from "./supabase-media-resolver";

/**
 * Production, service_role-backed PublicSocialShareCoverGateway (Task 032B).
 * SOCIAL SHARE COVER READ + SIGNING ONLY:
 *   1. the read-only `get_public_social_share_cover` RPC (migration 0041),
 *      which requires the slug's current PUBLISHED version, derives the
 *      Project and returns only its effective SOCIAL_SHARE_COVER reference;
 *   2. `createSignedUrl` for exactly that one returned storage path in the
 *      `project-media` bucket (1 hour, the shared runtime media TTL).
 * There is no signer accepting arbitrary paths, no table access (`.from`),
 * no listing, upload, move or delete. A fresh client per call; nothing
 * cached at module scope. Signed URLs are never persisted or logged. Any RPC
 * or signing error is a generic failure with no database detail.
 */

export interface SocialShareCoverReference {
  storagePath: string;
  width: number | null;
  height: number | null;
  altText: string | null;
}

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDimension(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

/**
 * `null` = unknown/unpublished slug, no cover chosen, a row outside the
 * project-media bucket, or a non-image row (image only; legacy rows with a
 * NULL mime type are accepted as the role is image-only by upload policy).
 */
export function toSocialShareCoverReference(data: unknown): SocialShareCoverReference | null {
  if (data === null) return null;
  if (!isRecord(data) || !("cover" in data)) fail();
  const cover = data.cover;
  if (cover === null) return null;
  if (
    !isRecord(cover) ||
    typeof cover.storageBucket !== "string" ||
    typeof cover.storagePath !== "string" ||
    cover.storagePath.length === 0 ||
    !(cover.mimeType === null || typeof cover.mimeType === "string") ||
    !isDimension(cover.width) ||
    !isDimension(cover.height) ||
    !(cover.altText === null || typeof cover.altText === "string")
  ) {
    fail();
  }
  if (cover.storageBucket !== PROJECT_MEDIA_BUCKET) return null;
  if (cover.mimeType !== null && !cover.mimeType.toLowerCase().startsWith("image/")) return null;
  const altText = cover.altText !== null && cover.altText.trim() !== "" ? cover.altText.trim() : null;
  return { storagePath: cover.storagePath, width: cover.width, height: cover.height, altText };
}

export function getServiceRolePublicSocialShareCoverGateway(): PublicSocialShareCoverGateway {
  return {
    async getSignedSocialShareCover(publicSlug): Promise<SignedSocialShareCover | null> {
      const client = createServiceRoleSupabaseClient();
      const { data, error } = await client.rpc("get_public_social_share_cover", { p_public_slug: publicSlug });
      if (error) {
        throw new Error("Failed to load social share cover");
      }
      const reference = toSocialShareCoverReference(data);
      if (reference === null) return null;

      const signed = await client.storage
        .from(PROJECT_MEDIA_BUCKET)
        .createSignedUrl(reference.storagePath, RUNTIME_MEDIA_SIGNED_URL_TTL_SECONDS);
      if (signed.error || typeof signed.data?.signedUrl !== "string" || !/^https?:\/\//.test(signed.data.signedUrl)) {
        throw new Error("Failed to sign social share cover");
      }
      return { url: signed.data.signedUrl, width: reference.width, height: reference.height, altText: reference.altText };
    },
  };
}
