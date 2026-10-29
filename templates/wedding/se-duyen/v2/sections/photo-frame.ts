import type { CSSProperties } from "react";

import { classifyMediaOrientation } from "../../../../../lib/invitation-rendering/media-orientation";
import type { MediaResolution, ResolvedMedia } from "../../../../../lib/invitation-rendering/invitation-view-model-types";

/**
 * Se Duyên v2 — the art-directed photo frames (SD-V1-01, SD-V2-02).
 *
 * The approved direction paints each photograph as the background of its
 * frame rather than as an `<img>`, because the frames are part of a
 * composition: the opening card is the element that grows into the hero, and
 * the couple frames overlap on hand-tuned crops. Each frame therefore reads
 * its image, size and focal point from three CSS custom properties, and this
 * module is the only place they are written.
 *
 * Pure: it reads `url`, `width` and `height` off an already-RESOLVED media
 * item and returns inline custom properties. No storage lookup, signing,
 * rewriting, substitution or fallback — an absent frame is omitted by the
 * caller, never filled from another slot or from demo art
 * (docs/DECISIONS.md P7, M6–M10).
 */

/**
 * The four art-directed frames SD-V1-02B1 fills, named by their FROZEN
 * STYLESHEET STEM (`--sdp-<stem>-image`), which is not the editor slot key:
 *
 *   editor slot key   frozen stylesheet stem
 *   ---------------   ----------------------
 *   openingPhoto   →  hero
 *   portraitLead   →  coupleMain
 *   portraitAside  →  coupleAside
 *   closingPhoto   →  closing
 *
 * The album's tiles (SD-V2-02) are stems of the same kind, fed from the one
 * unbounded `gallery` slot rather than from a slot each. v2 draws one tile
 * per photograph in a grid, so there is a single `albumTile` stem and each
 * tile carries its own value for it on its own element.
 *
 * The stems are the approved prototype's and are deliberately left alone, so
 * the ported stylesheet stays diffable against the visual freeze. The
 * renderer root owns the slot-key mapping, in one place.
 */
export type SeDuyenPhotoSlot = "hero" | "coupleMain" | "coupleAside" | "closing" | "albumTile";

/**
 * A supplied photograph always covers its frame: it is the only crop that
 * can neither gap nor distort whatever ratio a customer uploads. The
 * stylesheet's own tuned focal points were measured against 3:4 sources, so
 * they are kept for a portrait or square photograph and a landscape one is
 * centred instead — a wide photograph in a tall frame has its subject near
 * the middle, not in the top fifth. Unknown dimensions keep the tuned
 * default, which is what the frame was designed around.
 */
export function photoFrameStyle(slot: SeDuyenPhotoSlot, photo: ResolvedMedia): CSSProperties {
  const orientation = classifyMediaOrientation(photo.width, photo.height);
  const style: Record<string, string> = {
    [`--sdp-${slot}-image`]: `url("${photo.url}")`,
    [`--sdp-${slot}-size`]: "cover",
  };
  if (orientation === "LANDSCAPE") {
    style[`--sdp-${slot}-pos`] = "center center";
  }
  return style as CSSProperties;
}

/** The first `RESOLVED` item of a slot, or `undefined` (absent, empty or `UNAVAILABLE`). */
export function firstResolved(items: readonly MediaResolution[] | undefined): ResolvedMedia | undefined {
  const first = items?.[0];
  return first?.status === "RESOLVED" ? first : undefined;
}
