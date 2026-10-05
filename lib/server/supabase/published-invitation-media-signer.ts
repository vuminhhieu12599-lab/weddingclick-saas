import { PROJECT_MEDIA_BUCKET } from "../media/media-constants";
import type { PublishedInvitationMediaSigner } from "../public-invitation/public-invitation-types";
import { RUNTIME_MEDIA_SIGNED_URL_TTL_SECONDS } from "./supabase-media-resolver";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * PUBLISHED INVITATION MEDIA SIGNING ONLY (Task 032A, Product Owner
 * direction: a narrowly scoped server-only service_role signer after the
 * public slug resolved to an exact PUBLISHED version).
 *
 * Batch-signs storage paths in the `project-media` bucket for a short
 * runtime lifetime. Its only caller is
 * lib/server/public-invitation/load-public-invitation.ts, which passes ONLY
 * storage references returned by `get_public_invitation` — media pinned
 * through `invitation_version_media` to the exact current PUBLISHED version
 * — and only those its persisted Snapshot references. It never lists,
 * queries, uploads, moves or deletes objects, never touches a table or RPC,
 * and is never used by staff, review, templates or domain code (guarded by
 * lib/server/public-invitation/__tests__/public-invitation.test.ts).
 *
 * Signed URLs are runtime-only: returned to the caller for one render and
 * never written to a Snapshot, the database or a log.
 */
export function createServiceRolePublishedInvitationMediaSigner(): PublishedInvitationMediaSigner {
  return async (media) => {
    const urls = new Map<string, string>();
    if (media.length === 0) {
      return urls;
    }
    const client = createServiceRoleSupabaseClient();
    const signed = await client.storage
      .from(PROJECT_MEDIA_BUCKET)
      .createSignedUrls(
        media.map((item) => item.storagePath),
        RUNTIME_MEDIA_SIGNED_URL_TTL_SECONDS,
      );
    if (signed.error || !Array.isArray(signed.data)) {
      throw new Error("Failed to sign published invitation media URLs");
    }
    // storage_path is unique per bucket (0007), so a path names exactly one pinned row.
    const urlByPath = new Map<string, string>();
    for (const item of signed.data) {
      if (item.error === null && typeof item.path === "string" && typeof item.signedUrl === "string" && item.signedUrl.trim() !== "") {
        urlByPath.set(item.path, item.signedUrl);
      }
    }
    for (const item of media) {
      const url = urlByPath.get(item.storagePath);
      if (url !== undefined) {
        urls.set(item.id, url);
      }
    }
    return urls;
  };
}
