import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import { classifyMediaOrientation, type MediaOrientation } from "../../../../../lib/invitation-rendering/media-orientation";

/**
 * Our Wedding Story v1 gallery rhythm (Visual Freeze v1 "Our Gallery").
 * Pure index arithmetic over the frozen `templateSlots.gallery` order: no
 * photo is dropped, duplicated or borrowed from another slot.
 */

export type GalleryRow =
  | { readonly kind: "feature"; readonly large: number; readonly small: readonly [number, number]; readonly flip: boolean }
  | { readonly kind: "pair"; readonly items: readonly [number, number] }
  | { readonly kind: "single"; readonly item: number };

/** Feature row slots in layout order: one large (portrait preferred) + two small. */
const FEATURE_SLOT_PREFERENCES: readonly (readonly MediaOrientation[])[] = [
  ["PORTRAIT", "SQUARE", "LANDSCAPE"],
  ["SQUARE", "LANDSCAPE", "PORTRAIT"],
  ["SQUARE", "LANDSCAPE", "PORTRAIT"],
];

/** Real orientation from real dimensions only; unknown (or `UNAVAILABLE`) counts as square, the neutral fit. */
function orientationOf(media: MediaResolution): MediaOrientation {
  if (media.status !== "RESOLVED") return "SQUARE";
  return classifyMediaOrientation(media.width, media.height) ?? "SQUARE";
}

/**
 * Deterministic orientation-aware placement inside one feature row. Pass 1
 * gives every slot its first-choice orientation where one is left, pass 2 its
 * second choice, and so on; within a pass, slots fill in layout order and take
 * the earliest matching photo, so slot order is kept as far as orientations
 * allow. A final pass fills anything still empty with the earliest remaining
 * photo. Returns, per slot, the chunk-relative photo index.
 */
export function assignFeatureRow(orientations: readonly MediaOrientation[]): [number, number, number] {
  const used = new Set<number>();
  const assigned: (number | null)[] = [null, null, null];
  const take = (wanted: MediaOrientation | null): number | null => {
    for (let index = 0; index < orientations.length; index += 1) {
      if (!used.has(index) && (wanted === null || orientations[index] === wanted)) {
        used.add(index);
        return index;
      }
    }
    return null;
  };
  for (let rank = 0; rank < 3; rank += 1) {
    FEATURE_SLOT_PREFERENCES.forEach((preferences, slot) => {
      if (assigned[slot] === null) assigned[slot] = take(preferences[rank] ?? null);
    });
  }
  const filled = assigned.map((index) => index ?? take(null) ?? 0);
  return [filled[0] ?? 0, filled[1] ?? 0, filled[2] ?? 0];
}

/**
 * Magazine rhythm: rows of one large + two small photos, alternating side; a
 * remainder of two becomes a pair, a remainder of one a wide closer.
 */
export function buildGalleryRows(gallery: readonly MediaResolution[]): GalleryRow[] {
  const rows: GalleryRow[] = [];
  let start = 0;
  let flip = false;
  while (gallery.length - start >= 3) {
    const [large, smallA, smallB] = assignFeatureRow(gallery.slice(start, start + 3).map(orientationOf));
    rows.push({ kind: "feature", large: large + start, small: [smallA + start, smallB + start], flip });
    flip = !flip;
    start += 3;
  }
  const remaining = gallery.length - start;
  if (remaining === 2) rows.push({ kind: "pair", items: [start, start + 1] });
  if (remaining === 1) rows.push({ kind: "single", item: start });
  return rows;
}
