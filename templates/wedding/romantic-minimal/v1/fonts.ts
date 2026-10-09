import { Allura, Cormorant_Garamond, Great_Vibes } from "next/font/google";

/**
 * Romantic Minimal v1 — the `romantic-classic` font preset
 * (docs/DECISIONS.md "RM-01" / "RM-02").
 *
 * Exactly the three approved Task 029 families, self-hosted by the Next build
 * through `next/font/google`: no runtime `@import`, no font CDN, no committed
 * font files. All three are SIL Open Font License 1.1 families with a
 * `vietnamese` subset. Each is exposed as a renderer-scoped CSS variable on
 * the renderer root; `preload: false` keeps them off other renderers' routes
 * (they download only when Romantic Minimal text uses them).
 *
 * Tests never execute this module: renderer tests mock `./fonts`, because
 * `next/font` loaders only run under the Next compiler.
 */

const serif = Cormorant_Garamond({
  weight: ["500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--rm-serif",
});

const script = Great_Vibes({
  weight: "400",
  style: "normal",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--rm-script",
});

/** Fine hairline script for the Just Married and Thank You lettering. */
const fineScript = Allura({
  weight: "400",
  style: "normal",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--rm-fine-script",
});

/** Class names declaring `--rm-serif`, `--rm-script` and `--rm-fine-script`. */
export const ROMANTIC_MINIMAL_V1_FONT_VARIABLES_CLASS_NAME = [serif.variable, script.variable, fineScript.variable].join(" ");
