import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";

/**
 * Se Duyên v2 — which photographs the album draws (SD-V2-02).
 *
 * Pure and deterministic: no React, no media access, no business rule. Given
 * the `gallery` slot exactly as the ViewModel holds it, it returns the
 * photographs to draw, in the customer's own order.
 *
 * WHAT CHANGED FROM v1. v1 drew four art-directed frames of different shapes
 * and showed only the first four photographs of the slot; the Product Owner
 * rejected that composition on a phone, and the photographs past the fourth
 * were never reachable. v2 draws ONE TILE PER PHOTOGRAPH in a responsive
 * grid, up to `SE_DUYEN_V2_ALBUM_LIMIT`, so a Project with ten assigned
 * photographs shows ten.
 *
 * Only RESOLVED items are eligible. An UNAVAILABLE one is skipped rather
 * than kept as a blank tile, and the tiles after it close up instead of
 * leaving a hole, so `position` numbers the photographs actually drawn.
 * Nothing is ever repeated to fill the grid and nothing is substituted from
 * another slot or from demo art (docs/DECISIONS.md P7, M6–M10): with two
 * photographs the album draws two tiles, and with none it draws nothing at
 * all.
 */

/**
 * The most photographs the album draws. The `gallery` slot itself stays
 * unbounded in the editor — this is the album's own ceiling, which the
 * Product Owner set at ten (SD-V2-02); an eleventh assigned photograph is
 * simply not drawn rather than overflowing the approved page.
 */
export const SE_DUYEN_V2_ALBUM_LIMIT = 10;

export interface AlbumPhoto {
  /** Position among the drawn photographs, from 1, for labels and alt text. */
  readonly position: number;
  readonly media: ResolvedMedia;
}

/**
 * The album's drawn tiles: the RESOLVED photographs of the slot in slot
 * order, at most `SE_DUYEN_V2_ALBUM_LIMIT`. Fewer photographs simply means
 * fewer tiles; `[]` means the section is not drawn.
 */
export function albumPhotos(gallery: readonly MediaResolution[]): AlbumPhoto[] {
  const resolved = gallery.filter((item): item is ResolvedMedia => item.status === "RESOLVED");
  return resolved
    .slice(0, SE_DUYEN_V2_ALBUM_LIMIT)
    .map((media, index) => ({ position: index + 1, media }));
}

/** Stepping through the album wraps both ways. */
export function stepAlbum(position: number, step: 1 | -1, count: number): number {
  return (position + step + count) % count;
}
