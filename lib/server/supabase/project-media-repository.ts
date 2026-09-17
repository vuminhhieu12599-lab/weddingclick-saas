import { StorageApiError, type SupabaseClient } from "@supabase/supabase-js";

import type { MediaType } from "../../domain";
import { PROJECT_MEDIA_BUCKET } from "../media/media-constants";
import type {
  DeleteProjectMediaOutcome,
  InsertProjectMediaOutcome,
  InsertProjectMediaRow,
  MediaGateway,
  StorageObjectInfo,
  UpdateProjectMediaOutcome,
} from "../media/media-gateway";
import type { ProjectMediaRecord, UpdateProjectMediaPatch } from "../media/media-types";

/**
 * Production MediaGateway (Task 024 Phase 2): the only place in this
 * feature that issues real @supabase/supabase-js Postgrest + Storage
 * calls. Always invoked with a staff-scoped client (Task 004's
 * createStaffSupabaseClient), so both `project_media` table RLS and the
 * bucket-scoped `storage.objects` RLS remain the real enforcement — this
 * module never uses an elevated bypass-RLS credential or any privileged client.
 */
interface ProjectMediaRow {
  id: string;
  project_id: string;
  media_type: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const PROJECT_MEDIA_COLUMNS =
  "id, project_id, media_type, storage_bucket, storage_path, mime_type, size_bytes, " +
  "width, height, alt_text, sort_order, created_by, created_at, updated_at";

/** Postgres SQLSTATE for a unique-constraint violation (project_media_storage_object_unique, migration 0007). */
const UNIQUE_VIOLATION = "23505";

/**
 * Postgres SQLSTATE for a foreign-key-violation (Task 024 Phase 3). project_media
 * has exactly three incoming RESTRICT FKs today
 * (invitation_version_media_project_media_fkey, migration 0013b;
 * wedding_details_groom_bank_qr_media_fk / wedding_details_bride_bank_qr_media_fk,
 * migration 0008) — every one of them means "this media row is currently
 * referenced elsewhere and cannot be deleted." Blanket-mapping this code on
 * the exact DELETE shape below (scoped by project_id + id, no other
 * statement in this repository can raise it) is therefore safe without
 * parsing the constraint name out of the free-form error message/details.
 */
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Narrow, conservative predicate for "the Storage object does not exist"
 * (Task 024 Phase 2 live-bug patch, following real dev/staging runtime
 * verification). Two independent signals, either sufficient on its own:
 *
 * - `error.status === 404`: a genuine transport-level 404 (`Response.status`,
 *   parsed directly by storage-js's fetch handler — storage-js `fetch.ts`
 *   `handleError`). Not what this project's live Storage service actually
 *   returns for a missing object today, but kept as the most direct
 *   possible signal in case that ever changes.
 * - `error.statusCode === "404" && error.code === "NoSuchKey"`: the actual
 *   live shape confirmed against this project's dev/staging Storage service
 *   for a missing object — a transport HTTP 400 whose JSON body is
 *   `{ statusCode: "404", error: "not_found", code: "NoSuchKey" }`.
 *   storage-js's `handleError` derives both `StorageApiError.statusCode`
 *   and `.code` from that response body, never from the transport status —
 *   `const statusCode = err?.statusCode || err?.code || status + ''` — and
 *   `"NoSuchKey"` is Storage's own documented, stable service-specific
 *   error code for "object not found" (never reused for another failure
 *   kind — see https://supabase.com/docs/guides/storage/debugging/error-codes),
 *   so requiring it alongside `statusCode === "404"` keeps this from ever
 *   matching an unrelated `400` that merely happens to carry `statusCode`.
 *
 * A plain HTTP 400 without this exact `statusCode`/`code` pairing, any
 * other `StorageApiError` (403, 500, ...), a non-`StorageApiError`
 * `StorageError` (e.g. a network-level `StorageUnknownError`, which carries
 * no `status`/`statusCode`/`code` at all), or a `{ data: null, error: null }`
 * response are all still treated as a generic infrastructure failure —
 * never surfaced as "not found."
 */
function isStorageObjectNotFound(error: StorageApiError): boolean {
  if (error.status === 404) {
    return true;
  }
  return error.statusCode === "404" && error.code === "NoSuchKey";
}

function toProjectMediaRecord(row: ProjectMediaRow): ProjectMediaRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    mediaType: row.media_type as MediaType,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseProjectMediaGateway: MediaGateway<SupabaseClient> = {
  async projectExists(client, projectId: string): Promise<boolean> {
    const { data, error } = await client
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query project");
    }

    return data !== null;
  },

  async createSignedUploadPath(client, storagePath: string): Promise<{ token: string }> {
    const { data, error } = await client.storage
      .from(PROJECT_MEDIA_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      throw new Error("Failed to create signed upload URL");
    }

    return { token: data.token };
  },

  /**
   * "Object does not exist" is classified by `isStorageObjectNotFound`
   * (see above) — never surfaced with the raw Storage message/details.
   */
  async getStorageObjectInfo(client, storagePath: string): Promise<StorageObjectInfo | null> {
    const { data, error } = await client.storage.from(PROJECT_MEDIA_BUCKET).info(storagePath);

    if (error) {
      if (error instanceof StorageApiError && isStorageObjectNotFound(error)) {
        return null;
      }
      throw new Error("Failed to read Storage object metadata");
    }

    if (!data) {
      throw new Error("Failed to read Storage object metadata");
    }

    if (
      typeof data.size !== "number" ||
      !Number.isFinite(data.size) ||
      !Number.isInteger(data.size) ||
      data.size <= 0 ||
      typeof data.contentType !== "string" ||
      data.contentType.length === 0
    ) {
      throw new Error("Storage object metadata is missing size or content type");
    }

    return { sizeBytes: data.size, contentType: data.contentType };
  },

  async insertProjectMedia(
    client,
    row: InsertProjectMediaRow,
  ): Promise<InsertProjectMediaOutcome> {
    try {
      const { data, error } = await client
        .from("project_media")
        .insert({
          project_id: row.projectId,
          media_type: row.mediaType,
          storage_bucket: PROJECT_MEDIA_BUCKET,
          storage_path: row.storagePath,
          mime_type: row.mimeType,
          size_bytes: row.sizeBytes,
          width: null,
          height: null,
          alt_text: row.altText,
          sort_order: row.sortOrder,
          created_by: row.createdBy,
        })
        .select(PROJECT_MEDIA_COLUMNS)
        .single();

      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          return { kind: "DUPLICATE" };
        }
        return { kind: "OTHER_FAILURE" };
      }

      return {
        kind: "INSERTED",
        media: toProjectMediaRecord(data as unknown as ProjectMediaRow),
      };
    } catch {
      return { kind: "AMBIGUOUS_FAILURE" };
    }
  },

  /** Task 024 Phase 3 — direct RLS SELECT, deterministic three-key order. */
  async listProjectMedia(client, projectId: string): Promise<ProjectMediaRecord[]> {
    const { data, error } = await client
      .from("project_media")
      .select(PROJECT_MEDIA_COLUMNS)
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw new Error("Failed to query project media");
    }

    return (data as unknown as ProjectMediaRow[]).map(toProjectMediaRecord);
  },

  /**
   * Task 024 Phase 3 — genuine partial RLS UPDATE. Builds the SQL payload
   * from exactly the keys present on `patch` (never a full-row
   * read-modify-write), scoped by (project_id, id) together so a
   * wrong-project media id behaves identically to a nonexistent one.
   */
  async updateProjectMedia(
    client,
    projectId: string,
    mediaId: string,
    patch: UpdateProjectMediaPatch,
  ): Promise<UpdateProjectMediaOutcome> {
    const update: Record<string, unknown> = {};
    if ("altText" in patch) {
      update.alt_text = patch.altText;
    }
    if ("sortOrder" in patch) {
      update.sort_order = patch.sortOrder;
    }

    const { data, error } = await client
      .from("project_media")
      .update(update)
      .eq("project_id", projectId)
      .eq("id", mediaId)
      .select(PROJECT_MEDIA_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to update project media");
    }

    if (!data) {
      return { kind: "NOT_FOUND" };
    }

    return { kind: "UPDATED", media: toProjectMediaRecord(data as unknown as ProjectMediaRow) };
  },

  /**
   * Task 024 Phase 3 — single atomic
   * `DELETE ... WHERE project_id = ? AND id = ? RETURNING storage_bucket,
   * storage_path`. Never a separate SELECT-then-DELETE — the returned
   * storage location comes from the same statement that commits the
   * delete.
   */
  async deleteProjectMedia(
    client,
    projectId: string,
    mediaId: string,
  ): Promise<DeleteProjectMediaOutcome> {
    const { data, error } = await client
      .from("project_media")
      .delete()
      .eq("project_id", projectId)
      .eq("id", mediaId)
      .select("storage_bucket, storage_path")
      .maybeSingle();

    if (error) {
      if (error.code === FOREIGN_KEY_VIOLATION) {
        return { kind: "REFERENCED_CONFLICT" };
      }
      return { kind: "OTHER_FAILURE" };
    }

    if (!data) {
      return { kind: "NOT_FOUND" };
    }

    const row = data as unknown as { storage_bucket: string; storage_path: string };
    return { kind: "DELETED", storageBucket: row.storage_bucket, storagePath: row.storage_path };
  },

  /**
   * Task 024 Phase 3 — Storage cleanup performed only after a confirmed DB
   * delete (see delete-project-media.ts). Deliberately named
   * `removeMediaStorageObject` — the Phase 2 No-Cleanup Rule guard
   * (static-security-review.test.ts) retires the shorter cleanup-method
   * name that Finding 2 removed.
   */
  async removeMediaStorageObject(client, storagePath: string): Promise<boolean> {
    const { error } = await client.storage.from(PROJECT_MEDIA_BUCKET).remove([storagePath]);
    return !error;
  },
};
