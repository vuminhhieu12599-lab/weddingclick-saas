import { allowedMimeTypesForMediaType, maxBytesForMediaType } from "../../domain";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import { canonicalizeProjectId } from "./generate-media-storage-path";
import type { MediaGateway } from "./media-gateway";
import type { FinalizeMediaResult } from "./media-types";
import { validateFinalizeMediaInput } from "./validate-finalize-media-input";

/**
 * Finalize-Media use case (Task 024 Phase 2). Runs only after the browser
 * reports a successful direct Storage upload. Never trusts client-supplied
 * MIME/size — Storage's own `info()` metadata is the sole authoritative
 * source (§3). Inserts through plain staff RLS (`project_media_insert_staff`,
 * migration 0007) — never an RPC (§4).
 *
 * Duplicate/replay detection relies solely on the INSERT's own
 * `(storage_bucket, storage_path)` unique-violation outcome (an
 * authoritative, race-free signal — never a separate pre-check-then-insert
 * two-step, which would reopen the exact TOCTOU race the unique constraint
 * exists to prevent).
 *
 * Review-findings patch, Finding 2 — No-Cleanup Rule: no INSERT failure of
 * any kind (DUPLICATE/AMBIGUOUS_FAILURE/OTHER_FAILURE) ever triggers
 * Storage removal here. The previous design re-checked ownership by
 * `(storage_bucket, storage_path)` after a non-duplicate failure and
 * removed the Storage object if the re-check found no row — but that
 * re-check-then-remove sequence is itself a TOCTOU race: a concurrent
 * finalize request can insert a valid, committed `project_media` row
 * between this request's re-check and its `remove()` call, causing this
 * request to delete an object a valid row now owns. There is no
 * synchronization primitive available here that closes that window, so
 * the only safe behavior is to never call Storage removal from this
 * failure path at all. A resulting orphaned Storage object (wasted
 * storage, cleanable later by a maintenance job that does not exist yet)
 * is the explicitly accepted, safe failure mode — preferable to ever
 * deleting an object a committed row may own.
 */
export async function finalizeMedia<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: MediaGateway<TClient>,
): Promise<FinalizeMediaResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const projectId = canonicalizeProjectId(rawProjectId);

  const exists = await gateway.projectExists(staff.supabase, projectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const input = validateFinalizeMediaInput(rawBody, projectId);

  const info = await gateway.getStorageObjectInfo(staff.supabase, input.storagePath);
  if (!info) {
    throw new ApiError("NOT_FOUND", "Storage object not found");
  }

  const allowedMimeTypes = allowedMimeTypesForMediaType(input.mediaType) as readonly string[];
  if (!allowedMimeTypes.includes(info.contentType)) {
    throw new ApiError(
      "INVARIANT",
      "Uploaded object's content type does not match the declared media type policy",
    );
  }

  const maxBytes = maxBytesForMediaType(input.mediaType);
  if (info.sizeBytes > maxBytes) {
    throw new ApiError(
      "INVARIANT",
      "Uploaded object exceeds the size limit for the declared media type",
    );
  }

  const outcome = await gateway.insertProjectMedia(staff.supabase, {
    projectId,
    mediaType: input.mediaType,
    storagePath: input.storagePath,
    mimeType: info.contentType,
    sizeBytes: info.sizeBytes,
    altText: input.altText,
    sortOrder: input.sortOrder,
    createdBy: staff.userId,
  });

  if (outcome.kind === "INSERTED") {
    return { media: outcome.media };
  }

  if (outcome.kind === "DUPLICATE") {
    // The unique-violation itself is proof an existing row already owns
    // this object — never remove it (No-Cleanup Rule).
    throw new ApiError("CONFLICT", "This Storage object has already been finalized");
  }

  // outcome.kind === "AMBIGUOUS_FAILURE" | "OTHER_FAILURE": neither case
  // ever attempts Storage removal (No-Cleanup Rule, Finding 2) — an
  // ownership-recheck-then-remove sequence is a TOCTOU race against a
  // concurrent finalize's INSERT, so no synchronous cleanup is performed
  // for any DB insert failure, definite or ambiguous.
  throw new ApiError("INTERNAL", "Failed to finalize media");
}
