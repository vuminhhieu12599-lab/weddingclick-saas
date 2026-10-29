import { Be_Vietnam_Pro, Cormorant_Garamond } from "next/font/google";

/**
 * Se Duyên v2 — the `lacquer-garamond` font preset (SD-V1-01), the same
 * two families as v1 and no new production font (CLAUDE.md §19).
 *
 * Exactly the two families of the approved pilot v03 freeze, self-hosted by
 * the Next build through `next/font/google`: no runtime `@import`, no font
 * CDN, no committed font files. Both carry a `vietnamese` subset, and both
 * are already in the catalogue — Cormorant Garamond is the serif of
 * Vietnamese Heritage and Romantic Minimal, Be Vietnam Pro is drawn for
 * Vietnamese — so this preset adds no new production font and needs no new
 * licensing check (CLAUDE.md §19).
 *
 * The variable names are the frozen prototype's (`--sdp-display`,
 * `--sdp-sans`), because the ported stylesheet reads them by those names.
 * `preload: false` keeps them off other renderers' routes: they download
 * only when Se Duyên text uses them (CLAUDE.md §19 — never load the whole
 * catalogue on every invitation).
 *
 * Tests never execute this module: renderer tests mock `./fonts`, because
 * `next/font` loaders only run under the Next compiler.
 */

/**
 * Display face. An old-style serif with calligraphic roots reads as poetic
 * and classic without pretending to be a script. 500/600 only — the frozen
 * direction uses no other weight.
 */
const display = Cormorant_Garamond({
  subsets: ["vietnamese"],
  weight: ["500", "600"],
  display: "swap",
  preload: false,
  variable: "--sdp-display",
});

/** Micro-type: holds up at the 10–11px eyebrows and labels. */
const sans = Be_Vietnam_Pro({
  subsets: ["vietnamese"],
  weight: ["300", "400", "500"],
  display: "swap",
  preload: false,
  variable: "--sdp-sans",
});

/** Class name declaring `--sdp-display` and `--sdp-sans`. */
export const SE_DUYEN_V2_FONT_VARIABLES_CLASS_NAME = [display.variable, sans.variable].join(" ");
