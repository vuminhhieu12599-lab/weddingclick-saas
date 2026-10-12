import { Cormorant_Garamond, Inter } from "next/font/google";

/**
 * LAUNCH-P0-04 showroom typography (CLAUDE.md §19). Only fonts already in
 * production use by the certified renderers (Our Wedding Story, Romantic
 * Minimal, Elegant Editorial): Cormorant Garamond and Inter, both SIL Open
 * Font License 1.1, with the `vietnamese` subset. Self-hosted by next/font at
 * build time; no runtime request to Google.
 */

const display = Cormorant_Garamond({
  weight: ["500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--sr-font-display",
});

const sans = Inter({
  weight: ["400", "500", "600"],
  style: "normal",
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--sr-font-sans",
});

export const SHOWROOM_FONT_VARIABLES_CLASS_NAME = [display.variable, sans.variable].join(" ");
