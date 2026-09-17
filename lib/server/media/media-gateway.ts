import type { MediaType } from "../../domain";
import type { ProjectMediaRecord } from "./media-types";

/** Exact fields finalize needs from Storage's object-info response. */
export interface StorageObjectInfo {
  sizeBytes: number;
  contentType: string;
}

export interface InsertProjectMediaRow {
  projectId: string;
  mediaType: MediaType;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  altText: string | null;
  sortOrder: number;
  createdBy: string;
}

/**
 * Three-way classification of an INSERT failure, driving the No-Cleanup
 * Rule (Task 024 Phase 2 review-findings patch, Finding 2):
 *
 * - `DUPLICATE`: the `project_media_storage_object_unique` constraint
 *   fired — a row already owns this exact (bucket, path).
 * - `AMBIGUOUS_FAILURE`: the insert call itself threw (network/transport
 *   failure, or any outcome where we cannot even get a definite `{error}`
 *   response) — whether the row committed is unknown.
 * - `OTHER_FAILURE`: a definite, well-formed Postgrest error that is not
 *   the duplicate constraint.
 *
 * Every one of these three outcomes maps to an error response and, as of
 * the Finding 2 patch, **never** triggers Storage removal — an ownership
 * re-check followed by `remove()` is a TOCTOU race (a concurrent finalize
 * can insert a valid row between the re-check and the removal), so no
 * synchronous cleanup is attempted for any INSERT failure. A safe orphaned
 * Storage object (wasted storage, cleanable later by a maintenance job
 * that does not exist yet — explicitly out of scope here) is preferable to
 * ever deleting an object a committed row may own.
 */
export type InsertProjectMediaOutcome =
  | { kind: "INSERTED"; media: ProjectMediaRecord }
  | { kind: "DUPLICATE" }
  | { kind: "AMBIGUOUS_FAILURE" }
  | { kind: "OTHER_FAILURE" };

/**
 * Small seam (Task 024 Phase 2, mirrors ProjectEventsGateway /
 * WeddingDetailsGateway) decoupling the upload-intent/finalize use cases
 * from the real @supabase/supabase-js + Storage client shape.
 *
 * Every method is called with a staff-scoped client (Task 004's
 * createStaffSupabaseClient) so both `projects`/`project_media` table RLS
 * and the bucket-scoped `storage.objects` RLS (both `is_staff()`-gated,
 * migrations 0007/0023) remain the real enforcement — this feature never
 * uses an elevated bypass-RLS credential or any privileged client (API_CONTRACT.md §3.2).
 *
 * `insertProjectMedia` is a plain RLS INSERT (`project_media_insert_staff`,
 * migration 0007) — never an RPC. No media-specific trusted business
 * action exists or is authorized for Phase 2 (API_CONTRACT.md §3.2).
 *
 * No Storage-removal method exists on this interface. The Finding 2 patch
 * removed the synchronous ownership-recheck-then-remove cleanup path
 * entirely (TOCTOU race) and did not replace it with anything — no
 * background cleanup job is in scope for Phase 2.
 */
export interface MediaGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  createSignedUploadPath(client: TClient, storagePath: string): Promise<{ token: string }>;
  getStorageObjectInfo(client: TClient, storagePath: string): Promise<StorageObjectInfo | null>;
  insertProjectMedia(
    client: TClient,
    row: InsertProjectMediaRow,
  ): Promise<InsertProjectMediaOutcome>;
}
