import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ELEGANT_EDITORIAL_V1_MANIFEST } from "../manifest";
import { ELEGANT_EDITORIAL_V1_COPY } from "../copy";
import {
  ELEGANT_EDITORIAL_V1_PALETTE,
  ELEGANT_EDITORIAL_V1_PALETTE_KEY,
  ELEGANT_EDITORIAL_V1_PALETTE_STYLE,
} from "../palette";

/**
 * RF-06B font, palette and fixed-copy checks (docs/DECISIONS.md "RF-06-0 …"
 * P3, P9, P10, P16). `fonts.ts` is verified as source: `next/font` loaders
 * only execute under the Next compiler, so `npm run build` is the runtime
 * proof of the configuration.
 */

const V1_DIR = join(__dirname, "..");

function read(file: string): string {
  return readFileSync(join(V1_DIR, file), "utf8");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

interface LoaderCall {
  family: string;
  body: string;
}

function loaderCalls(source: string): LoaderCall[] {
  return [...stripComments(source).matchAll(/\b(Great_Vibes|Source_Serif_4|Inter|\w+)\(\{([\s\S]*?)\}\);/g)].map(
    (match) => ({ family: match[1] as string, body: match[2] as string }),
  );
}

function stringArray(body: string, key: string): string[] {
  const match = new RegExp(`${key}:\\s*(\\[[^\\]]*\\]|"[^"]*")`).exec(body);
  if (match === null) return [];
  return [...(match[1] as string).matchAll(/"([^"]*)"/g)].map((entry) => entry[1] as string);
}

describe("fonts.ts (P3)", () => {
  const source = read("fonts.ts");
  const code = stripComments(source);

  it("imports exactly the three approved families from next/font/google and nothing else", () => {
    const imports = [...code.matchAll(/^import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gm)];
    expect(imports.map((match) => match[2])).toStrictEqual(["next/font/google"]);
    expect(imports[0]?.[1]).toBe("{ Great_Vibes, Inter, Source_Serif_4 }");
  });

  it("calls each loader once, at module scope, within the P3 weight/style ceiling", () => {
    const calls = loaderCalls(source);
    expect(calls.map((call) => call.family).sort()).toStrictEqual(["Great_Vibes", "Inter", "Source_Serif_4"]);
    const byFamily = Object.fromEntries(calls.map((call) => [call.family, call.body]));
    const ceiling: Record<string, { weights: string[]; styles: string[] }> = {
      Great_Vibes: { weights: ["400"], styles: ["normal"] },
      Source_Serif_4: { weights: ["400", "600"], styles: ["normal", "italic"] },
      Inter: { weights: ["400", "500", "600"], styles: ["normal"] },
    };
    for (const [family, limit] of Object.entries(ceiling)) {
      const body = byFamily[family] as string;
      const weights = stringArray(body, "weight");
      const styles = stringArray(body, "style");
      expect(weights.length, family).toBeGreaterThan(0);
      expect(styles.length, family).toBeGreaterThan(0);
      for (const weight of weights) expect(limit.weights, `${family} weight ${weight}`).toContain(weight);
      for (const style of styles) expect(limit.styles, `${family} style ${style}`).toContain(style);
      expect(stringArray(body, "subsets"), family).toStrictEqual(["latin", "vietnamese"]);
      expect(body, family).toMatch(/display:\s*"swap"/);
      expect(body, family).toMatch(/variable:\s*"--ee-font-(script|serif|sans)"/);
      expect(body, family).not.toMatch(/axes|preload:\s*false|adjustFontFallback/);
    }
  });

  it("uses no runtime font URL, @import, local font file or other loader", () => {
    expect(code).not.toMatch(/fonts\.(googleapis|gstatic)\.com|@import|next\/font\/local|\.woff2?|\.ttf|<link/);
  });

  it("the renderer imports fonts only through ./fonts, and only fonts.ts touches next/font", () => {
    const renderer = stripComments(read("elegant-editorial-v1.tsx"));
    expect(renderer).toMatch(/from\s+"\.\/fonts"/);
    expect(renderer).not.toMatch(/next\/font/);
  });

  it("the renderer CSS references only the v1 font variables plus generic fallbacks", () => {
    const css = read("elegant-editorial-v1.module.css");
    const variables = new Set([...css.matchAll(/var\((--[\w-]*font[\w-]*)\)/g)].map((match) => match[1]));
    expect([...variables].sort()).toStrictEqual(["--ee-font-sans", "--ee-font-script", "--ee-font-serif"]);
    expect(css).not.toMatch(/Dancing Script|Playfair|Iowan|Great Vibes|Source Serif|"Inter"/);
  });
});

describe("palette.ts (P9, P16)", () => {
  it("is the single manifest palette", () => {
    expect(ELEGANT_EDITORIAL_V1_PALETTE_KEY).toBe("green-ivory");
    expect(ELEGANT_EDITORIAL_V1_MANIFEST.design.palettes).toStrictEqual([ELEGANT_EDITORIAL_V1_PALETTE_KEY]);
  });

  it("defines renderer-scoped semantic --ee-* custom properties with hex values, frozen", () => {
    expect(Object.isFrozen(ELEGANT_EDITORIAL_V1_PALETTE)).toBe(true);
    expect(Object.isFrozen(ELEGANT_EDITORIAL_V1_PALETTE_STYLE)).toBe(true);
    for (const required of ["--ee-background", "--ee-surface", "--ee-text", "--ee-muted", "--ee-accent", "--ee-border"]) {
      expect(ELEGANT_EDITORIAL_V1_PALETTE).toHaveProperty(required);
    }
    for (const [name, value] of Object.entries(ELEGANT_EDITORIAL_V1_PALETTE)) {
      expect(name).toMatch(/^--ee-[a-z-]+$/);
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(ELEGANT_EDITORIAL_V1_PALETTE_STYLE).toStrictEqual({ ...ELEGANT_EDITORIAL_V1_PALETTE });
  });

  it("the CSS uses only palette variables defined in palette.ts (no global tokens, no raw hex)", () => {
    const css = read("elegant-editorial-v1.module.css");
    const palette = new Set(Object.keys(ELEGANT_EDITORIAL_V1_PALETTE));
    const cssLocal = new Set(["--ee-serif", "--ee-sans", "--ee-script", "--ee-gutter", "--ee-font-serif", "--ee-font-sans", "--ee-font-script"]);
    for (const match of css.matchAll(/var\((--[\w-]+)\)/g)) {
      const name = match[1] as string;
      expect(palette.has(name) || cssLocal.has(name), name).toBe(true);
    }
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });

  it("body text / background pairs meet WCAG AA contrast", () => {
    const luminance = (hex: string): number => {
      const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
      const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    const p = ELEGANT_EDITORIAL_V1_PALETTE;
    for (const [fg, bg] of [
      ["--ee-text", "--ee-background"],
      ["--ee-muted", "--ee-background"],
      ["--ee-muted", "--ee-surface-sage"],
      ["--ee-bronze", "--ee-background"],
      ["--ee-accent", "--ee-surface"],
      ["--ee-on-accent", "--ee-accent"],
      ["--ee-on-accent-muted", "--ee-accent"],
    ] as const) {
      expect(contrast(p[fg], p[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("copy.ts (P10)", () => {
  function deepFrozen(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return true;
    return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
  }

  it("is deeply frozen fixed template copy", () => {
    expect(deepFrozen(ELEGANT_EDITORIAL_V1_COPY)).toBe(true);
  });

  it("uses the frozen Vietnamese labels", () => {
    expect(ELEGANT_EDITORIAL_V1_COPY.opening.salutation).toBe("Trân trọng kính mời");
    expect(ELEGANT_EDITORIAL_V1_COPY.hero.kicker).toBe("Save the date");
    expect(ELEGANT_EDITORIAL_V1_COPY.families.labelBySide).toStrictEqual({ GROOM: "Nhà Trai", BRIDE: "Nhà Gái" });
    expect(ELEGANT_EDITORIAL_V1_COPY.calendar.weekdayHeaders).toStrictEqual(["T2", "T3", "T4", "T5", "T6", "T7", "CN"]);
    expect(ELEGANT_EDITORIAL_V1_COPY.events.mapLink).toBe("Xem chỉ đường");
    expect(ELEGANT_EDITORIAL_V1_COPY.ceremony.lunarLabel).toBe("Tức ngày");
  });

  it("contains no date, weekday, lunar, location, price or customer data", () => {
    const text = JSON.stringify(ELEGANT_EDITORIAL_V1_COPY);
    expect(text).not.toMatch(/\d{1,2}[/.]\d{1,2}|20\d\d|Thứ (Hai|Ba|Tư|Năm|Sáu|Bảy)|Chủ Nhật|Bính Ngọ|Đà Nẵng|Hồ Chí Minh|VND|đồng/);
    expect(text).not.toMatch(/\bMAYBE\b|QR_COMMON|RSVP|countdown|music/i);
  });
});
