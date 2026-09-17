import type { MediaType } from "../../domain";
import type { ProjectMediaRecord, UpdateProjectMediaPatch } from "./media-types";

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
 * Task 024 Phase 3 — outcome of a direct partial RLS UPDATE scoped by
 * (project_id, id). `NOT_FOUND` covers both "media never existed" and
 * "media belongs to a different project" identically — the repository
 * must never distinguish them (anti-enumeration, mirrors PE004's
 * documented behavior in project-events-rpc-error-codes.ts).
 */
export type UpdateProjectMediaOutcome =
  | { kind: "UPDATED"; media: ProjectMediaRecord }
  | { kind: "NOT_FOUND" };

/**
 * Task 024 Phase 3 — outcome of the single atomic
 * `DELETE ... WHERE project_id = ? AND id = ? RETURNING storage_bucket,
 * storage_path` statement. `DELETED` carries the server-returned asset
 * location captured in the same statement that performed the delete — the
 * use case never re-derives or trusts a separately-fetched path.
 * `REFERENCED_CONFLICT` covers every current incoming RESTRICT FK toward
 * project_media (invitation_version_media, and wedding_details' groom/bride
 * bank-QR references) — blanket-mapping SQLSTATE 23503 to this outcome is
 * safe specifically because those three FKs are the only possible source of
 * a 23503 on this exact DELETE shape (see the Phase 3 preflight report).
 */
export type DeleteProjectMediaOutcome =
  | { kind: "DELETED"; storageBucket: string; storagePath: string }
  | { kind: "NOT_FOUND" }
  | { kind: "REFERENCED_CONFLICT" }
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
 * Phase 2 finalize/INSERT failure still has no synchronous Storage cleanup:
 * the Finding 2 patch removed the unsafe ownership-recheck-then-remove path
 * (TOCTOU race) and that path remains retired — no INSERT-failure outcome
 * calls Storage removal. Phase 3 adds `removeMediaStorageObject` below, but
 * only as cleanup after a confirmed, already-committed `project_media`
 * DELETE (see that method's own doc comment) — this does not weaken or
 * reopen the Phase 2 No-Cleanup Rule.
 */
export interface MediaGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  createSignedUploadPath(client: TClient, storagePath: string): Promise<{ token: string }>;
  getStorageObjectInfo(client: TClient, storagePath: string): Promise<StorageObjectInfo | null>;
  insertProjectMedia(
    client: TClient,
    row: InsertProjectMediaRow,
  ): Promise<InsertProjectMediaOutcome>;

  /** Task 024 Phase 3 — direct RLS SELECT, ordered sort_order/created_at/id. */
  listProjectMedia(client: TClient, projectId: string): Promise<ProjectMediaRecord[]>;

  /**
   * Task 024 Phase 3 — direct partial RLS UPDATE scoped by
   * (project_id, id). `patch` must contain only the fields actually
   * present in the validated request — the implementation must never
   * read the full row first and write it back (see update-project-media.ts).
   */
  updateProjectMedia(
    client: TClient,
    projectId: string,
    mediaId: string,
    patch: UpdateProjectMediaPatch,
  ): Promise<UpdateProjectMediaOutcome>;

  /**
   * Task 024 Phase 3 — single atomic
   * `DELETE ... WHERE project_id = ? AND id = ? RETURNING storage_bucket,
   * storage_path`. Never a separate SELECT-then-DELETE.
   */
  deleteProjectMedia(
    client: TClient,
    projectId: string,
    mediaId: string,
  ): Promise<DeleteProjectMediaOutcome>;

  /**
   * Task 024 Phase 3 — Storage cleanup performed only AFTER a confirmed
   * DB delete. Deliberately named differently from the Phase 2 Finding 2
   * cleanup method that was retired (an unsafe recheck-then-remove path
   * against an INSERT failure) — this method's caller never faces that
   * TOCTOU shape, since it only ever runs once the DB row is already
   * committed-deleted. Resolves `true` on confirmed Storage success,
   * `false` on a reported (non-thrown) Storage error; the caller treats
   * both a `false` result and a thrown rejection identically — log-only,
   * never a failed API response (see delete-project-media.ts).
   */
  removeMediaStorageObject(client: TClient, storagePath: string): Promise<boolean>;
}
