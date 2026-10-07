import { Cormorant_Garamond, Great_Vibes, Playfair_Display } from "next/font/google";

/**
 * Vietnamese Heritage v1 — the `heritage-classic` font preset
 * (docs/DECISIONS.md "VH-01 …" font decision).
 *
 * Exactly the three approved Task 029 families, self-hosted by the Next
 * build through `next/font/google`: no runtime CSS `@import`, no external
 * font `<link>`, no committed font files, no global font catalog. All three
 * are SIL Open Font License 1.1 families that ship a `vietnamese` subset.
 * Only the weights/styles in the VH-01 ceiling are requested; each family is
 * exposed as a renderer-scoped CSS variable applied on the renderer root.
 *
 * `preload: false`: the production binding registry statically imports every
 * renderer, so a preloaded family would be preloaded on every invitation
 * route, including Elegant Editorial ones (CLAUDE.md §19). Without preload
 * the browser fetches these files only when Vietnamese Heritage text uses
 * the family; `display: "swap"` keeps text visible meanwhile.
 *
 * Vietnamese glyph QA on real devices is a VH certification step; nothing
 * here claims these fonts are certified.
 *
 * Tests never execute this module: renderer tests mock `./fonts` before
 * importing the renderer, because `next/font` loaders only run under the
 * Next compiler. `npm run build` is the real proof of this configuration.
 */

const serif = Cormorant_Garamond({
  weight: ["500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--vh-font-serif",
});

const display = Playfair_Display({
  weight: "500",
  style: "italic",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--vh-font-display",
});

const script = Great_Vibes({
  weight: "400",
  style: "normal",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--vh-font-script",
});

/** Class names declaring `--vh-font-serif`, `--vh-font-display` and `--vh-font-script`. */
export const VIETNAMESE_HERITAGE_V1_FONT_VARIABLES_CLASS_NAME = [serif.variable, display.variable, script.variable].join(" ");
