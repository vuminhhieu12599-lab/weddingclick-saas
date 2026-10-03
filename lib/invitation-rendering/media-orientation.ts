/**
 * Shared presentation helper (docs/DECISIONS.md RF13 / RF-03 M13
 * "Dimensions"): the deterministic orientation of a media item from its
 * real natural `width` / `height`. Pure, framework-free, no imports.
 *
 * Null or unusable dimensions (legacy rows uploaded before dimensions were
 * captured) yield `null`: the caller chooses its own neutral fallback, and
 * no dimension is ever fabricated.
 */
export type MediaOrientation = "PORTRAIT" | "LANDSCAPE" | "SQUARE";

/** width / height below this is portrait; above the upper bound is landscape; between is (near-)square. */
export const MEDIA_ORIENTATION_PORTRAIT_MAX_RATIO = 0.9;
export const MEDIA_ORIENTATION_LANDSCAPE_MIN_RATIO = 1.1;

function isDimension(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

export function classifyMediaOrientation(width: number | null, height: number | null): MediaOrientation | null {
  if (!isDimension(width) || !isDimension(height)) return null;
  const ratio = width / height;
  if (ratio < MEDIA_ORIENTATION_PORTRAIT_MAX_RATIO) return "PORTRAIT";
  if (ratio > MEDIA_ORIENTATION_LANDSCAPE_MIN_RATIO) return "LANDSCAPE";
  return "SQUARE";
}
