import type { MediaResolution } from "../../../../../lib/invitation-rendering/invitation-view-model-types";

/**
 * Vietnamese Heritage v1 — deterministic album rhythm (pure).
 *
 * The Task 029 row rhythm large → pair → tall pair → wide → pair → wide,
 * repeated, laid over the canonical gallery positions **in order**. Unlike
 * the prototype it never reorders photos by orientation (RF-03 M8). A
 * two-slot row that would run past the end becomes a single wide row, so no
 * slot is empty.
 *
 * VH-02A-QA1 photo preservation: tiles never crop a photograph. Every photo
 * is contained on its print's mat; a full-width row (`large`, `wide`) takes
 * the photo's own width ÷ height, bounded to [4:5, 3:2], so portrait and
 * landscape photos fill their print with at most a thin mat. No face
 * detection, focal point or image analysis: only the MediaResolution
 * dimensions already in the ViewModel.
 */

export type HeritageAlbumRowKind = "large" | "pair" | "tall" | "wide";

export interface HeritageAlbumRow {
  readonly kind: HeritageAlbumRowKind;
  /** Canonical gallery indices, ascending and contiguous. */
  readonly indices: readonly number[];
}

const ROW_PATTERN: readonly HeritageAlbumRowKind[] = ["large", "pair", "tall", "wide", "pair", "wide"];

function slotsOf(kind: HeritageAlbumRowKind): number {
  return kind === "pair" || kind === "tall" ? 2 : 1;
}

export function layoutHeritageAlbum(count: number): HeritageAlbumRow[] {
  const rows: HeritageAlbumRow[] = [];
  let next = 0;
  for (let row = 0; next < count; row += 1) {
    const planned = ROW_PATTERN[row % ROW_PATTERN.length] as HeritageAlbumRowKind;
    const kind = slotsOf(planned) > count - next ? "wide" : planned;
    const size = slotsOf(kind);
    rows.push({ kind, indices: Array.from({ length: size }, (_, offset) => next + offset) });
    next += size;
  }
  return rows;
}

/** Narrowest and widest full-width print ratios (width ÷ height): 4:5 and 3:2. */
export const ALBUM_PRINT_RATIO_MIN = 0.8;
export const ALBUM_PRINT_RATIO_MAX = 1.5;

/**
 * The print ratio a full-width row gives one item, or `null` to keep the
 * row's designed shape: paired rows always keep it, as do `UNAVAILABLE`
 * items and photos without known dimensions. Rounded to 4 decimals so the
 * markup is deterministic.
 */
export function albumPrintRatio(kind: HeritageAlbumRowKind, item: MediaResolution): number | null {
  if (kind !== "large" && kind !== "wide") return null;
  if (item.status !== "RESOLVED" || item.width === null || item.height === null) return null;
  const ratio = Math.min(ALBUM_PRINT_RATIO_MAX, Math.max(ALBUM_PRINT_RATIO_MIN, item.width / item.height));
  return Math.round(ratio * 10000) / 10000;
}
