import type { CSSProperties } from "react";

/**
 * Elegant Editorial v1 — the single `green-ivory` palette (docs/DECISIONS.md
 * "RF-06-0 …" P9, P16).
 *
 * v1 declares exactly one palette, so the renderer never branches on
 * `design.paletteKey`. Values are versioned with v1 and applied as
 * renderer-scoped custom properties on the renderer root, so the certified
 * appearance never depends on global color tokens (P11, P45).
 */

export const ELEGANT_EDITORIAL_V1_PALETTE_KEY = "green-ivory";

export type ElegantEditorialV1PaletteVariable =
  | "--ee-background"
  | "--ee-surface"
  | "--ee-surface-sage"
  | "--ee-text"
  | "--ee-muted"
  | "--ee-accent"
  | "--ee-accent-deep"
  | "--ee-accent-soft"
  | "--ee-gold"
  | "--ee-bronze"
  | "--ee-border"
  | "--ee-on-accent"
  | "--ee-on-accent-muted"
  | "--ee-heart"
  | "--ee-backdrop";

/** Semantic tokens → values. Text/background pairs keep WCAG AA contrast for body copy. */
export const ELEGANT_EDITORIAL_V1_PALETTE: Readonly<Record<ElegantEditorialV1PaletteVariable, string>> = Object.freeze({
  "--ee-background": "#faf7ef",
  "--ee-surface": "#fdfcf9",
  "--ee-surface-sage": "#eef1e7",
  "--ee-text": "#2c3327",
  "--ee-muted": "#4f5a47",
  "--ee-accent": "#47593f",
  "--ee-accent-deep": "#2e3c29",
  "--ee-accent-soft": "#8a9a7c",
  "--ee-gold": "#b99a5b",
  "--ee-bronze": "#7d6243",
  "--ee-border": "#d8cfb4",
  "--ee-on-accent": "#fdfcf9",
  "--ee-on-accent-muted": "#dfe5d5",
  "--ee-heart": "#b8433a",
  "--ee-backdrop": "#e3e8da",
});

/** The palette as a root `style` value; custom properties only. */
export const ELEGANT_EDITORIAL_V1_PALETTE_STYLE: CSSProperties & Readonly<Record<ElegantEditorialV1PaletteVariable, string>> =
  Object.freeze({ ...ELEGANT_EDITORIAL_V1_PALETTE });
