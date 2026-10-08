import type { SnapshotPayloadV1 } from "./snapshot-payload-types";

/**
 * RF-02 media reference extraction (docs/DECISIONS.md RF11 rule C,
 * docs/PHYSICAL_DATABASE_PLAN.md §2.15): the exact set of `project_media`
 * ids a SUCCESS Snapshot Payload v1 references. This is the future input
 * for `invitation_version_media` rows (one row per referenced media item);
 * nothing is written here.
 *
 * Deterministic payload traversal order — cover, gallery (payload order),
 * audio, groom QR, bride QR, then the optional groom and bride portraits
 * (RF7 Product Owner amendment), then the Photo Story ids in payload order
 * and the Love Story photo (RF7 Photo Story amendment), then (TE-04) every
 * `templateSlots` id by lexical slot key and position; all appended last so
 * payloads without them keep their exact order — deduplicated by id, keeping the first
 * occurrence. `qr.commonMediaId` is absent in payload v1 (S9). Unreferenced
 * project media never appears because only the payload is read.
 */
export function extractSnapshotMediaRefs(payload: SnapshotPayloadV1): string[] {
  const { media } = payload;
  const candidates = [
    media.coverMediaId,
    ...media.galleryMediaIds,
    media.audioMediaId,
    media.qr.groomMediaId,
    media.qr.brideMediaId,
    media.portrait?.groomMediaId,
    media.portrait?.brideMediaId,
    ...(media.photoStoryMediaIds ?? []),
    media.loveStoryPhotoMediaId,
    // TE-04: template slot ids, slot keys in lexical order (JSONB key order
    // is not a contract), positions in order. Absent for legacy payloads, so
    // their extraction order is unchanged.
    ...Object.keys(media.templateSlots ?? {})
      .sort()
      .flatMap((key) => media.templateSlots?.[key] ?? []),
  ];

  const refs: string[] = [];
  const seen = new Set<string>();
  for (const id of candidates) {
    if (id !== undefined && !seen.has(id)) {
      seen.add(id);
      refs.push(id);
    }
  }
  return refs;
}
