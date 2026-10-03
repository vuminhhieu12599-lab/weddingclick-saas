import type { CustomerReviewMediaSigner } from "../customer-review/customer-review-gateway";
import { PROJECT_MEDIA_BUCKET } from "../media/media-constants";
import { RUNTIME_MEDIA_SIGNED_URL_TTL_SECONDS } from "./supabase-media-resolver";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * CUSTOMER REVIEW MEDIA SIGNING ONLY (Task 030B, Product Owner decision A).
 *
 * The single, narrow service_role Storage capability approved for the
 * customer REVIEW page: batch-sign storage paths in the `project-media`
 * bucket for a short runtime lifetime. Its only caller is
 * lib/server/customer-review/load-customer-review.ts, which passes ONLY
 * storage references returned by `get_customer_review` — i.e. media pinned
 * through `invitation_version_media` to the exact CURRENT REVIEW versions
 * of a token-validated Project, and only those the persisted Snapshot
 * references. It never lists, queries, uploads, moves or deletes objects,
 * never touches a table, and is never used by staff, templates or domain
 * code (guarded by lib/server/customer-review/__tests__/customer-review-static-security.test.ts).
 *
 * Signed URLs are runtime-only: returned to the caller for one render and
 * never written to a Snapshot, the database or a log.
 */
export function createServiceRoleCustomerReviewMediaSigner(): CustomerReviewMediaSigner {
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
      throw new Error("Failed to sign customer review media URLs");
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
