import type { CSSProperties } from "react";

/**
 * Vietnamese Heritage v1 — the single `heritage-vermilion` palette
 * (docs/DECISIONS.md "VH-01 …" design decision).
 *
 * v1 declares exactly one palette, so the renderer never branches on
 * `design.paletteKey`. Values are the approved Task 029 Vietnamese Heritage
 * tokens, versioned with v1 and applied as renderer-scoped custom properties
 * on the renderer root, so the appearance never depends on global color
 * tokens.
 */

export const VIETNAMESE_HERITAGE_V1_PALETTE_KEY = "heritage-vermilion";

export type VietnameseHeritageV1PaletteVariable =
  | "--vh-paper"
  | "--vh-silk"
  | "--vh-ivory"
  | "--vh-vermilion"
  | "--vh-vermilion-deep"
  | "--vh-vermilion-wash"
  | "--vh-gold"
  | "--vh-gold-soft"
  | "--vh-ink"
  | "--vh-ink-muted"
  | "--vh-lacquer"
  | "--vh-lacquer-text"
  | "--vh-backdrop";

/** Semantic tokens → values (Task 029 names in the comments). */
export const VIETNAMESE_HERITAGE_V1_PALETTE: Readonly<Record<VietnameseHeritageV1PaletteVariable, string>> = Object.freeze({
  /** paper: heritage paper background */
  "--vh-paper": "#f4ecd8",
  /** silk: raised cream surfaces (cards) */
  "--vh-silk": "#f8efe0",
  /** ivory: text on red */
  "--vh-ivory": "#f7f0e2",
  /** vermilion: lacquer red */
  "--vh-vermilion": "#9c2b34",
  /** vermilion-deep */
  "--vh-vermilion-deep": "#7c2028",
  /** vermilion-wash */
  "--vh-vermilion-wash": "#f2ddd6",
  /** gold: antique champagne gold */
  "--vh-gold": "#b8935a",
  /** gold hairlines on paper */
  "--vh-gold-soft": "#d8bf8e",
  /** ink */
  "--vh-ink": "#2c1c19",
  /** secondary text */
  "--vh-ink-muted": "#5a3d33",
  /** Love Story oxblood / lacquer red */
  "--vh-lacquer": "#5a161d",
  /** Love Story text */
  "--vh-lacquer-text": "#f3e8d2",
  /** desktop backdrop around the centred column */
  "--vh-backdrop": "#e9dfc8",
});

/** The palette as a root `style` value; custom properties only. */
export const VIETNAMESE_HERITAGE_V1_PALETTE_STYLE: CSSProperties & Readonly<Record<VietnameseHeritageV1PaletteVariable, string>> =
  Object.freeze({ ...VIETNAMESE_HERITAGE_V1_PALETTE });
