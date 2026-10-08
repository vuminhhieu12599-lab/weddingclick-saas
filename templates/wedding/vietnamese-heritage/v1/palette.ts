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
  | "--vh-paper-warm"
  | "--vh-silk"
  | "--vh-card"
  | "--vh-ivory"
  | "--vh-cream"
  | "--vh-white-warm"
  | "--vh-qr-plate"
  | "--vh-vermilion"
  | "--vh-vermilion-deep"
  | "--vh-vermilion-rose"
  | "--vh-vermilion-wash"
  | "--vh-door"
  | "--vh-door-shade"
  | "--vh-shadow"
  | "--vh-gold"
  | "--vh-gold-soft"
  | "--vh-gold-deep"
  | "--vh-gold-light"
  | "--vh-gold-pale"
  | "--vh-ink"
  | "--vh-ink-muted"
  | "--vh-ink-soft"
  | "--vh-ink-date"
  | "--vh-lacquer"
  | "--vh-lacquer-top"
  | "--vh-lacquer-bottom"
  | "--vh-lacquer-text"
  | "--vh-lacquer-heading"
  | "--vh-backdrop";

/** Semantic tokens → values (Task 029 names or roles in the comments). */
export const VIETNAMESE_HERITAGE_V1_PALETTE: Readonly<Record<VietnameseHeritageV1PaletteVariable, string>> = Object.freeze({
  /** paper: heritage paper background */
  "--vh-paper": "#f4ecd8",
  /** hero paper */
  "--vh-paper-warm": "#f5ecdb",
  /** silk: raised cream surfaces */
  "--vh-silk": "#f8efe0",
  /** print frames, cards and seal plates */
  "--vh-card": "#fbf6ec",
  /** ivory */
  "--vh-ivory": "#f7f0e2",
  /** text on vermilion buttons and lacquer panels */
  "--vh-cream": "#fbf3e6",
  /** brightest closing text */
  "--vh-white-warm": "#fffaf0",
  /** QR plate (scanner contrast) */
  "--vh-qr-plate": "#ffffff",
  /** vermilion: lacquer red */
  "--vh-vermilion": "#9c2b34",
  /** vermilion-deep */
  "--vh-vermilion-deep": "#7c2028",
  /** salutation / album heading rose */
  "--vh-vermilion-rose": "#a2434b",
  /** vermilion-wash */
  "--vh-vermilion-wash": "#f2ddd6",
  /** red door paper base */
  "--vh-door": "#8a1a20",
  /** door tint and warm shadows */
  "--vh-door-shade": "#5c0e14",
  /** deep vignette */
  "--vh-shadow": "#3a0a0e",
  /** gold: antique champagne gold */
  "--vh-gold": "#b8935a",
  /** gold on red / cover gold */
  "--vh-gold-soft": "#d8bf8e",
  /** eyebrows and lotus line art */
  "--vh-gold-deep": "#a37b42",
  /** closing date */
  "--vh-gold-light": "#e6cc98",
  /** cover names */
  "--vh-gold-pale": "#eedcb4",
  /** ink */
  "--vh-ink": "#2c1c19",
  /** secondary text */
  "--vh-ink-muted": "#5a3d33",
  /** addresses and lunar text */
  "--vh-ink-soft": "#7a5a4a",
  /** hero date line */
  "--vh-ink-date": "#6e4a3c",
  /** Love Story oxblood / lacquer red */
  "--vh-lacquer": "#5a161d",
  /** lacquer gradient top */
  "--vh-lacquer-top": "#681b23",
  /** lacquer gradient bottom */
  "--vh-lacquer-bottom": "#4d1219",
  /** text on lacquer and on the cover */
  "--vh-lacquer-text": "#f3e8d2",
  /** headings on lacquer */
  "--vh-lacquer-heading": "#f6ecdc",
  /** desktop backdrop around the centred column */
  "--vh-backdrop": "#e9dfc8",
});

/** The palette as a root `style` value; custom properties only. */
export const VIETNAMESE_HERITAGE_V1_PALETTE_STYLE: CSSProperties & Readonly<Record<VietnameseHeritageV1PaletteVariable, string>> =
  Object.freeze({ ...VIETNAMESE_HERITAGE_V1_PALETTE });
