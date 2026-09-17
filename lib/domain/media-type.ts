/** docs/DATABASE.md §11; docs/PHYSICAL_DATABASE_PLAN.md §2.9 */
export const MEDIA_TYPES = ["COVER", "GALLERY", "AUDIO", "QR_GROOM", "QR_BRIDE", "QR_COMMON"] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Task 024 (Phase 1) frozen upload policy — docs/SECURITY.md §15 ("approved
 * MIME/type", "file-size limit"). Two policies only: IMAGE (every
 * image-bearing MediaType — COVER/GALLERY/QR_GROOM/QR_BRIDE/QR_COMMON) and
 * AUDIO. Values match the frozen `project-media` Storage bucket
 * configuration (supabase/migrations/..._0023_project_media_storage.sql)
 * exactly — the two must never diverge.
 */
export const IMAGE_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AUDIO_MEDIA_MIME_TYPES = ["audio/mpeg", "audio/mp4"] as const;

export type MediaMimeType =
  | (typeof IMAGE_MEDIA_MIME_TYPES)[number]
  | (typeof AUDIO_MEDIA_MIME_TYPES)[number];

export const IMAGE_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const AUDIO_MEDIA_MAX_BYTES = 20 * 1024 * 1024;

/** Bucket-wide hard limit — the `project-media` bucket's own file_size_limit. */
export const PROJECT_MEDIA_BUCKET_MAX_BYTES = 20 * 1024 * 1024;

const AUDIO_MEDIA_TYPES: readonly MediaType[] = ["AUDIO"];

function isAudioMediaType(mediaType: MediaType): boolean {
  return AUDIO_MEDIA_TYPES.includes(mediaType);
}

/** COVER/GALLERY/QR_GROOM/QR_BRIDE/QR_COMMON -> image policy; AUDIO -> audio policy. */
export function allowedMimeTypesForMediaType(
  mediaType: MediaType,
): readonly MediaMimeType[] {
  return isAudioMediaType(mediaType) ? AUDIO_MEDIA_MIME_TYPES : IMAGE_MEDIA_MIME_TYPES;
}

/** COVER/GALLERY/QR_GROOM/QR_BRIDE/QR_COMMON -> 10 MiB; AUDIO -> 20 MiB. */
export function maxBytesForMediaType(mediaType: MediaType): number {
  return isAudioMediaType(mediaType) ? AUDIO_MEDIA_MAX_BYTES : IMAGE_MEDIA_MAX_BYTES;
}
