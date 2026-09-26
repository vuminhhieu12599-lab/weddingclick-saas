import type { AlbumPhoto, MediaOrientation } from "./types";

/** Width/height ratios within ±10% of 1 count as square. */
const SQUARE_TOLERANCE = 0.1;

/**
 * A photo's orientation: explicit `orientation` wins; otherwise derived
 * from `width`/`height`; unknown dimensions are treated as square (the
 * most neutral fit for any slot).
 */
export function photoOrientation(photo: AlbumPhoto): MediaOrientation {
  if (photo.orientation) return photo.orientation;
  if (photo.width && photo.height) {
    const ratio = photo.width / photo.height;
    if (ratio > 1 + SQUARE_TOLERANCE) return "landscape";
    if (ratio < 1 - SQUARE_TOLERANCE) return "portrait";
  }
  return "square";
}

/** CSS object-position from the optional focal point (0–1 each); centre by default. */
export function photoObjectPosition(photo: AlbumPhoto): string {
  const x = clampUnit(photo.focalPoint?.x ?? 0.5);
  const y = clampUnit(photo.focalPoint?.y ?? 0.5);
  return `${Math.round(x * 100)}% ${Math.round(y * 100)}%`;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** A template slot with its orientations in order of preference. */
export interface AlbumSlotPreference {
  preferred: readonly MediaOrientation[];
}

/**
 * Deterministic orientation-aware assignment. Returns, per slot, the index
 * of the photo placed there (`slots.length` must not exceed `photos.length`).
 *
 * Pass 1 gives every slot its first-choice orientation where one is left,
 * pass 2 its second choice, and so on; within a pass, slots are filled in
 * layout order and take the earliest matching photo, so data order is kept
 * as far as the orientations allow. A final pass fills anything still empty
 * with the earliest remaining photo, so no slot is ever left blank.
 */
export function assignPhotosToSlots(photos: AlbumPhoto[], slots: AlbumSlotPreference[]): number[] {
  const orientations = photos.map(photoOrientation);
  const used = new Set<number>();
  const assigned: (number | null)[] = slots.map(() => null);
  const maxRank = Math.max(0, ...slots.map((slot) => slot.preferred.length));

  const take = (predicate: (photoIndex: number) => boolean): number | null => {
    for (let i = 0; i < photos.length; i += 1) {
      if (!used.has(i) && predicate(i)) {
        used.add(i);
        return i;
      }
    }
    return null;
  };

  for (let rank = 0; rank < maxRank; rank += 1) {
    slots.forEach((slot, slotIndex) => {
      const wanted = slot.preferred[rank];
      if (assigned[slotIndex] !== null || !wanted) return;
      assigned[slotIndex] = take((i) => orientations[i] === wanted);
    });
  }

  return assigned.map((photoIndex) => photoIndex ?? take(() => true) ?? 0);
}
