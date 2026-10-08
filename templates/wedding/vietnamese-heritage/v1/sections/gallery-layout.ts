/**
 * Vietnamese Heritage v1 — deterministic album rhythm (pure).
 *
 * The Task 029 row rhythm large → pair → tall pair → wide → pair → wide,
 * repeated, laid over the canonical gallery positions **in order**. Unlike
 * the prototype it never reorders photos by orientation (RF-03 M8): slots
 * keep their shape and photos are cropped into them. A two-slot row that
 * would run past the end becomes a single wide row, so no slot is empty.
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
