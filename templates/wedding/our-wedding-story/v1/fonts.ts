import { Allura, Cormorant_Garamond, Inter } from "next/font/google";

/**
 * Our Wedding Story v1 — the `champagne-editorial` font preset
 * (docs/DECISIONS.md "OWS-01").
 *
 * Exactly the three approved Visual Freeze v1 families, self-hosted by the
 * Next build through `next/font/google`: no runtime `@import`, no font CDN,
 * no committed font files. All three are SIL Open Font License 1.1 families
 * with a `vietnamese` subset. Each is exposed as a renderer-scoped CSS
 * variable on the renderer root; `preload: false` keeps them off other
 * renderers' routes (they download only when Our Wedding Story text uses
 * them).
 *
 * Tests never execute this module: renderer tests mock `./fonts`, because
 * `next/font` loaders only run under the Next compiler.
 */

const serif = Cormorant_Garamond({
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--ows-serif",
});

const sans = Inter({
  weight: ["300", "400", "500"],
  style: "normal",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--ows-sans",
});

/** The one restrained script accent (masthead "Story", "Thank you"). */
const script = Allura({
  weight: "400",
  style: "normal",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--ows-script",
});

/** Class names declaring `--ows-serif`, `--ows-sans` and `--ows-script`. */
export const OUR_WEDDING_STORY_V1_FONT_VARIABLES_CLASS_NAME = [serif.variable, sans.variable, script.variable].join(" ");
