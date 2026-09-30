import type { CSSProperties } from "react";

/**
 * Elegant Editorial v1 — the single `green-ivory` palette (docs/DECISIONS.md
 * "RF-06-0 …" P9, P16; "Elegant Editorial Production Design Baseline" B5
 * item 21 and Design Baseline D13).
 *
 * v1 declares exactly one palette, so the renderer never branches on
 * `design.paletteKey`. Values are the Task029 `GreenIvoryEditorialPrototype`
 * tokens, versioned with v1 and applied as renderer-scoped custom properties
 * on the renderer root, so the certified appearance never depends on global
 * color tokens (P11, P45). Task029 gold-alpha hairlines are derived in CSS
 * from `--ee-gold` (`color-mix`), never stored as separate raw values.
 */

export const ELEGANT_EDITORIAL_V1_PALETTE_KEY = "green-ivory";

export type ElegantEditorialV1PaletteVariable =
  | "--ee-background"
  | "--ee-surface"
  | "--ee-surface-sage"
  | "--ee-text"
  | "--ee-muted"
  | "--ee-secondary"
  | "--ee-accent"
  | "--ee-accent-deep"
  | "--ee-accent-soft"
  | "--ee-opening-highlight"
  | "--ee-gold"
  | "--ee-bronze"
  | "--ee-border"
  | "--ee-on-accent"
  | "--ee-on-accent-muted"
  | "--ee-heart"
  | "--ee-backdrop";

/** Semantic tokens → values (Task029 names in the comments). */
export const ELEGANT_EDITORIAL_V1_PALETTE: Readonly<Record<ElegantEditorialV1PaletteVariable, string>> = Object.freeze({
  /** ivory */
  "--ee-background": "#faf7ef",
  /** white-soft */
  "--ee-surface": "#fdfcf9",
  /** beige (sage-tinted ivory); also the beige-on-moss text */
  "--ee-surface-sage": "#eef1e7",
  /** ink */
  "--ee-text": "#2c3327",
  /** body / message text */
  "--ee-muted": "#4a5240",
  /** secondary, lunar and address text */
  "--ee-secondary": "#6f7a63",
  /** moss */
  "--ee-accent": "#47593f",
  /** moss-deep */
  "--ee-accent-deep": "#2e3c29",
  /** sage */
  "--ee-accent-soft": "#8a9a7c",
  /** opening radial highlight */
  "--ee-opening-highlight": "#5c7052",
  /** gold */
  "--ee-gold": "#b99a5b",
  /** bronze (Design Baseline D13) */
  "--ee-bronze": "#8c6f4e",
  /** RF-06D island borders (not a Task029 token; kept for the RF-06D owner) */
  "--ee-border": "#d8cfb4",
  /** white-soft on moss */
  "--ee-on-accent": "#fdfcf9",
  /** RF-06D island muted text on moss (kept for the RF-06D owner) */
  "--ee-on-accent-muted": "#dfe5d5",
  /** calendar heart */
  "--ee-heart": "#d0433a",
  /** desktop backdrop around the ≈480 px column (P12) */
  "--ee-backdrop": "#e3e8da",
});

/** The palette as a root `style` value; custom properties only. */
export const ELEGANT_EDITORIAL_V1_PALETTE_STYLE: CSSProperties & Readonly<Record<ElegantEditorialV1PaletteVariable, string>> =
  Object.freeze({ ...ELEGANT_EDITORIAL_V1_PALETTE });
