import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type { SeDuyenPhotoSlot } from "./photo-frame";

/**
 * Se Duyên v1 — which photograph goes in which album frame (SD-V1-02B2).
 *
 * Pure and deterministic: no React, no media access, no business rule. Given
 * the `gallery` slot exactly as the ViewModel holds it, it returns the frames
 * to draw, in the customer's own order.
 *
 * THE APPROVED ALBUM IS FOUR FRAMES, each a different shape: a full-width
 * lead, a staggered tall/small pair, then a square crop against the right
 * margin. That is the layout, not a limit on the slot — the editor's
 * `gallery` slot is unbounded, so a Project may hold any number of
 * photographs and the first four fill the album.
 *
 * Only RESOLVED items are eligible. An UNAVAILABLE one is skipped rather
 * than kept as a blank tile, so a guest never meets an empty frame, and the
 * frames after it close up instead of leaving a hole. Nothing is ever
 * repeated to fill a frame and nothing is substituted from another slot or
 * from demo art (docs/DECISIONS.md P7, M6–M10): with two photographs the
 * album draws two frames, and with none it draws nothing at all.
 */

/** The four album frames, in layout order. */
export const SE_DUYEN_ALBUM_FRAMES = ["albumLead", "albumTall", "albumSmall", "albumFoot"] as const;

export type SeDuyenAlbumFrame = (typeof SE_DUYEN_ALBUM_FRAMES)[number];

export interface AlbumPhoto {
  /** The frozen stylesheet stem of the frame this photograph fills. */
  readonly frame: SeDuyenAlbumFrame & SeDuyenPhotoSlot;
  /** Position among the drawn photographs, from 1, for labels and alt text. */
  readonly position: number;
  readonly media: ResolvedMedia;
}

/**
 * The album's drawn frames: the first four RESOLVED photographs of the slot,
 * in slot order, paired with the frame each one fills. Fewer photographs
 * simply means fewer frames; `[]` means the section is not drawn.
 */
export function albumPhotos(gallery: readonly MediaResolution[]): AlbumPhoto[] {
  const resolved = gallery.filter((item): item is ResolvedMedia => item.status === "RESOLVED");
  return SE_DUYEN_ALBUM_FRAMES.flatMap((frame, index): AlbumPhoto[] => {
    const media = resolved[index];
    return media === undefined ? [] : [{ frame, position: index + 1, media }];
  });
}

/** Stepping through the album wraps both ways. */
export function stepAlbum(position: number, step: 1 | -1, count: number): number {
  return (position + step + count) % count;
}
