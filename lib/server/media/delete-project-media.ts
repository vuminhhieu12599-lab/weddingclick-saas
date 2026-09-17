import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import { PROJECT_MEDIA_BUCKET } from "./media-constants";
import type { MediaGateway } from "./media-gateway";
import type { DeleteProjectMediaResult } from "./media-types";

/**
 * Delete-Project-Media use case (Task 024 Phase 3, DIRECT RLS DELETE per
 * API_CONTRACT.md §3.2 — no RPC, no activity log). Never a separate
 * SELECT-then-DELETE: the gateway's `deleteProjectMedia` performs one
 * atomic `DELETE ... RETURNING storage_bucket, storage_path`, so the
 * server-owned asset location is captured in the same statement that
 * commits the delete.
 *
 * The DB delete is authoritative. Once `outcome.kind === "DELETED"`, the
 * row is already gone — everything after that point is best-effort Storage
 * cleanup that must never change the API result (frozen contract, mirrors
 * API_CONTRACT.md §3.2's deletion-order rationale and the Phase 2
 * No-Cleanup Rule's "never compensate" posture). No DB reinsertion, no
 * compensating transaction, ever.
 */
export async function deleteProjectMedia<TClient>(
  rawProjectId: string,
  rawMediaId: string,
  staff: StaffContext<TClient>,
  gateway: MediaGateway<TClient>,
): Promise<DeleteProjectMediaResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  if (!isValidUuid(rawMediaId)) {
    throw new ApiError("BAD_REQUEST", "Media id must be a valid UUID");
  }

  const exists = await gateway.projectExists(staff.supabase, rawProjectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const outcome = await gateway.deleteProjectMedia(staff.supabase, rawProjectId, rawMediaId);

  if (outcome.kind === "NOT_FOUND") {
    // Wrong-project media id and nonexistent media id are indistinguishable
    // by design (same message/status either way).
    throw new ApiError("NOT_FOUND", "Media not found");
  }

  if (outcome.kind === "REFERENCED_CONFLICT") {
    // Covers every current incoming RESTRICT FK toward project_media
    // (invitation_version_media, and wedding_details' groom/bride bank-QR
    // references) — the message is deliberately generic across both
    // reasons. Storage is never touched: the DB delete did not happen.
    throw new ApiError("CONFLICT", "This media item is still in use and cannot be deleted");
  }

  if (outcome.kind === "OTHER_FAILURE") {
    // An unexpected DB failure. Storage is never touched: the DB delete
    // did not happen.
    throw new ApiError("INTERNAL", "Failed to delete media");
  }

  // outcome.kind === "DELETED": the DB row is already committed-deleted.
  // Everything below is best-effort cleanup — its outcome never changes
  // the response.
  if (outcome.storageBucket !== PROJECT_MEDIA_BUCKET) {
    // Corruption/legacy defense only — every row created by this feature
    // always uses PROJECT_MEDIA_BUCKET. Never attempt to remove an object
    // from a bucket this feature does not own.
    console.warn(
      "[deleteProjectMedia] Deleted row reported an unexpected storage bucket — skipping Storage cleanup",
    );
    return { deleted: true };
  }

  try {
    const removed = await gateway.removeMediaStorageObject(staff.supabase, outcome.storagePath);
    if (!removed) {
      console.warn("[deleteProjectMedia] Storage cleanup failed after DB delete");
    }
  } catch {
    console.warn("[deleteProjectMedia] Storage cleanup failed after DB delete");
  }

  return { deleted: true };
}
