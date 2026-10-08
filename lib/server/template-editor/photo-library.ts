import { isTemplateSlotAssignableMediaType, type TemplateSlotAssignableMediaType } from "../../domain";
import type { MediaResolver } from "../../invitation-rendering/invitation-view-model-types";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import type { MediaGateway } from "../media/media-gateway";
import { isValidUuid } from "../validation/uuid";

/**
 * TE-05A — one Project photograph as the Staff photo library shows it.
 * Staff-useful fields only: no storage bucket, storage path or creator.
 * `previewUrl` is a short-lived URL signed at request time with the staff
 * client (bucket stays private), or `null` when that one object could not
 * be signed; it is never persisted.
 */
export interface PhotoLibraryItem {
  readonly id: string;
  readonly mediaType: TemplateSlotAssignableMediaType;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly createdAt: string;
  readonly previewUrl: string | null;
}

export interface PhotoLibraryDependencies<TClient> {
  readonly media: Pick<MediaGateway<TClient>, "projectExists" | "listProjectMedia">;
  /** The existing staff-scoped batch signer (`createSupabaseMediaResolver`); never an elevated credential. */
  readonly createMediaResolver: (client: TClient, projectId: string, mediaIds: readonly string[]) => Promise<MediaResolver>;
}

function compareLibrary(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The Project's slot-assignable photographs (PHOTO + legacy photo roles;
 * never AUDIO, QR or SOCIAL_SHARE_COVER), oldest first, each with a preview
 * URL. Signing is scoped to this Project's ids (one RLS SELECT + one batch
 * signing call); an object that cannot be signed yields `previewUrl: null`
 * for that item only.
 */
export async function listPhotoLibrary<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  deps: PhotoLibraryDependencies<TClient>,
): Promise<PhotoLibraryItem[]> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const client = staff.supabase;
  if (!(await deps.media.projectExists(client, rawProjectId))) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const rows = (await deps.media.listProjectMedia(client, rawProjectId))
    .filter((row) => row.projectId === rawProjectId && isTemplateSlotAssignableMediaType(row.mediaType))
    .sort(compareLibrary);
  if (rows.length === 0) return [];

  const resolver = await deps.createMediaResolver(client, rawProjectId, rows.map((row) => row.id));
  const items: PhotoLibraryItem[] = [];
  for (const row of rows) {
    const resolution = await resolver.resolveMedia(row.id);
    items.push({
      id: row.id,
      mediaType: row.mediaType as TemplateSlotAssignableMediaType,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      createdAt: row.createdAt,
      previewUrl: resolution.status === "RESOLVED" ? resolution.url : null,
    });
  }
  return items;
}
