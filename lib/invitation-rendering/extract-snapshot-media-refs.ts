import type { SnapshotPayloadV1 } from "./snapshot-payload-types";

/**
 * RF-02 media reference extraction (docs/DECISIONS.md RF11 rule C,
 * docs/PHYSICAL_DATABASE_PLAN.md §2.15): the exact set of `project_media`
 * ids a SUCCESS Snapshot Payload v1 references. This is the future input
 * for `invitation_version_media` rows (one row per referenced media item);
 * nothing is written here.
 *
 * Deterministic payload traversal order — cover, gallery (payload order),
 * audio, groom QR, bride QR — deduplicated by id, keeping the first
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
