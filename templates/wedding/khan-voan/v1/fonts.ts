import { Be_Vietnam_Pro, Imperial_Script, Playfair_Display } from "next/font/google";

/**
 * Khăn Voan v1 — the `khan-voan-classic` font preset. Self-hosted by the Next
 * build (no font CDN at runtime). All three are SIL OFL families with a
 * `vietnamese` subset; `preload: false` keeps them off other renderers' routes.
 * Tests mock `./fonts`: `next/font` loaders only run under the Next compiler.
 */
const serif = Playfair_Display({
  weight: ["400", "500"],
  style: ["normal", "italic"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--kv-serif",
});

const sans = Be_Vietnam_Pro({
  weight: ["300", "400", "500"],
  style: "normal",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--kv-sans",
});

const script = Imperial_Script({
  weight: "400",
  style: "normal",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  preload: false,
  variable: "--kv-script",
});

/** Class names declaring `--kv-serif`, `--kv-sans` and `--kv-script`. */
export const KHAN_VOAN_V1_FONT_VARIABLES_CLASS_NAME = [serif.variable, sans.variable, script.variable].join(" ");
