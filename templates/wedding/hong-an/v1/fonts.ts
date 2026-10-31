import { Be_Vietnam_Pro, Cormorant_Garamond } from "next/font/google";

/**
 * Hồng Ân v1 — the `hong-an-cathedral` font preset (HA-TEMPLATE-01).
 *
 * No new production font (CLAUDE.md §19). Both families are already in the
 * catalogue and already carry a verified `vietnamese` subset: Cormorant
 * Garamond is the serif of Vietnamese Heritage, Romantic Minimal and Se
 * Duyên, and Be Vietnam Pro is drawn for Vietnamese. Nothing is downloaded
 * at runtime, no font file is committed, and no new licensing check is
 * needed.
 *
 * `preload: false` keeps both off every other renderer's route: they are
 * fetched only when Hồng Ân text actually uses them, so this template never
 * loads another invitation's faces and never pulls the whole catalogue.
 *
 * Tests never execute this module: `next/font` loaders only run under the
 * Next compiler, so renderer tests mock `./fonts`.
 */

/**
 * Display face. An old-style serif with calligraphic roots carries the
 * sacred, editorial tone without tipping into script. 500/600 only — the
 * approved direction uses no other weight.
 */
const display = Cormorant_Garamond({
  subsets: ["vietnamese"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
  variable: "--ha-display",
});

/** Micro-type: holds its diacritics at the 10–12px eyebrows and labels. */
const sans = Be_Vietnam_Pro({
  subsets: ["vietnamese"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  preload: false,
  variable: "--ha-sans",
});

/** Class name declaring `--ha-display` and `--ha-sans`. */
export const HONG_AN_V1_FONT_VARIABLES_CLASS_NAME = [display.variable, sans.variable].join(" ");
