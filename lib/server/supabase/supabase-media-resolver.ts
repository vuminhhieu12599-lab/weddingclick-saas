import type { SupabaseClient } from "@supabase/supabase-js";

import type { MediaResolution, MediaResolver } from "../../invitation-rendering/invitation-view-model-types";
import { PROJECT_MEDIA_BUCKET } from "../media/media-constants";
import { isValidUuid } from "../validation/uuid";

/**
 * Lifetime of a runtime media URL signed for one render (staff preview).
 * Runtime-only: these URLs are never written to a Snapshot, the database or
 * any renderer/template contract (docs/DECISIONS.md RF11 C, RF-03 A2).
 */
export const RUNTIME_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60;

const RESOLVER_MEDIA_COLUMNS = "id, project_id, storage_bucket, storage_path, width, height";

interface ResolverMediaRow {
  id: string;
  storagePath: string;
  storageBucket: string;
  width: number | null;
  height: number | null;
}

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isDimension(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

function toResolverMediaRow(value: unknown, projectId: string): ResolverMediaRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const { id, project_id, storage_bucket, storage_path, width, height } = value as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    project_id !== projectId ||
    typeof storage_bucket !== "string" ||
    typeof storage_path !== "string" ||
    storage_path.length === 0 ||
    !isDimension(width) ||
    !isDimension(height)
  ) {
    fail();
  }
  return { id, storageBucket: storage_bucket, storagePath: storage_path, width, height };
}

/**
 * Concrete Supabase-backed RF-03 `MediaResolver` (docs/DECISIONS.md RF-03
 * A2, M1–M5), for a staff-scoped client only — `project_media` table RLS and
 * the `project-media` bucket's `storage.objects` RLS (both `is_staff()`)
 * remain the real enforcement; no elevated credential is ever used.
 *
 * The frozen resolver interface is per-item, so this factory preloads in a
 * bounded way instead of querying per image: one `project_media` SELECT
 * scoped by (project_id, id IN mediaIds) and one batch `createSignedUrls`
 * call. The returned resolver only serves those precomputed results.
 *
 * Results (M2–M4):
 * - `RESOLVED` — the row belongs to `projectId`, lives in the approved
 *   bucket at its stored `storage_path`, and Storage signed it.
 * - `UNAVAILABLE` — no such row in this Project (including another
 *   Project's id or a non-UUID id), a row outside the approved bucket, or a
 *   per-object signing failure (e.g. the object is missing).
 * - throws — a query or whole-batch signing failure, a malformed row, or a
 *   request for an id outside the preloaded set (integration fault).
 */
export async function createSupabaseMediaResolver(
  client: SupabaseClient,
  projectId: string,
  mediaIds: readonly string[],
): Promise<MediaResolver> {
  if (!isValidUuid(projectId)) {
    throw new Error("Media resolver project id must be a valid UUID");
  }

  const requestedIds = [...new Set(mediaIds)];
  // A non-UUID id cannot name a project_media row; never send it to PostgREST.
  const queryIds = requestedIds.filter((id) => isValidUuid(id));
  const results = new Map<string, MediaResolution>(
    requestedIds.map((mediaId) => [mediaId, { status: "UNAVAILABLE", mediaId }]),
  );

  if (queryIds.length > 0) {
    const { data, error } = await client
      .from("project_media")
      .select(RESOLVER_MEDIA_COLUMNS)
      .eq("project_id", projectId)
      .in("id", queryIds);

    if (error) {
      throw new Error("Failed to query project media for resolution");
    }
    if (!Array.isArray(data)) fail();

    const rows = data
      .map((row: unknown) => toResolverMediaRow(row, projectId))
      .filter((row) => results.has(row.id) && row.storageBucket === PROJECT_MEDIA_BUCKET);

    if (rows.length > 0) {
      const signed = await client.storage
        .from(PROJECT_MEDIA_BUCKET)
        .createSignedUrls(
          rows.map((row) => row.storagePath),
          RUNTIME_MEDIA_SIGNED_URL_TTL_SECONDS,
        );

      if (signed.error || !Array.isArray(signed.data)) {
        throw new Error("Failed to sign project media URLs");
      }

      // storage_path is unique per bucket (0007), so a path names exactly one row.
      const urlByPath = new Map<string, string>();
      for (const item of signed.data) {
        if (item.error === null && typeof item.path === "string" && typeof item.signedUrl === "string" && item.signedUrl.trim() !== "") {
          urlByPath.set(item.path, item.signedUrl);
        }
      }

      for (const row of rows) {
        const url = urlByPath.get(row.storagePath);
        if (url !== undefined) {
          results.set(row.id, { status: "RESOLVED", mediaId: row.id, url, width: row.width, height: row.height });
        }
      }
    }
  }

  return {
    async resolveMedia(mediaId: string): Promise<MediaResolution> {
      const result = results.get(mediaId);
      if (result === undefined) {
        throw new Error("Media resolver was asked for an id outside its preloaded set");
      }
      return result;
    },
  };
}
