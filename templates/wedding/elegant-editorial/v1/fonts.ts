import { Great_Vibes, Inter, Source_Serif_4 } from "next/font/google";

/**
 * Elegant Editorial v1 — the `editorial-classic` font preset
 * (docs/DECISIONS.md "RF-06-0 …" P3, P16).
 *
 * Exactly the three approved families, self-hosted by the Next build through
 * `next/font/google`: no runtime CSS `@import`, no external font `<link>`, no
 * committed font files, no global font catalog. Only the weights/styles the
 * v1 CSS actually uses are requested, inside the P3 ceiling. Each family is
 * exposed as a renderer-scoped CSS variable applied on the renderer root.
 *
 * Vietnamese glyph and licence QA is RF-06E; nothing here claims these fonts
 * are certified.
 *
 * Tests never execute this module: renderer tests mock `./fonts` before
 * importing the renderer, because `next/font` loaders only run under the
 * Next compiler. `npm run build` is the real proof of this configuration.
 */

const script = Great_Vibes({
  weight: "400",
  style: "normal",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--ee-font-script",
});

const serif = Source_Serif_4({
  weight: ["400", "600"],
  style: ["normal", "italic"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--ee-font-serif",
});

const sans = Inter({
  weight: ["400", "500", "600"],
  style: "normal",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--ee-font-sans",
});

/** Class names declaring `--ee-font-script`, `--ee-font-serif` and `--ee-font-sans`. */
export const ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME = [script.variable, serif.variable, sans.variable].join(" ");
