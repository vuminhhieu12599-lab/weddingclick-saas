import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * RF-05 static boundary (docs/DECISIONS.md RF-05 clarification K3, K35,
 * K39, K43). Scans only the explicitly listed RF-05 production files, by
 * checkpoint layer; later RF-05 checkpoints extend these lists.
 */

/** RF-05A: renderer component + capability contracts. */
const RF05A_PRODUCTION_FILES = ["renderer-component.ts", "renderer-capabilities.ts", "rsvp-capability.ts"] as const;

/** RF-05B: implementation-binding registry. */
const RF05B_PRODUCTION_FILES = ["renderer-binding-errors.ts", "renderer-binding-registry.ts"] as const;

const RF05_PRODUCTION_FILES = [...RF05A_PRODUCTION_FILES, ...RF05B_PRODUCTION_FILES] as const;

/** The only RF-05A file allowed to reference React, and only via `import type`. */
const REACT_TYPE_IMPORT_FILE = "renderer-component.ts";

/** Removes block and line comments so documentation prose is not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readSource(file: string): string {
  return readFileSync(join(__dirname, "..", file), "utf8");
}

const FORBIDDEN_SIDE_EFFECTS: readonly RegExp[] = [
  /supabase/i,
  /service_role/,
  /\bfetch\s*\(/,
  /process\.env/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bnavigator\b/,
  /execCommand/,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /Date\.now/,
  /\bnew Date\b/,
  /performance\.now/,
  /Math\.random/,
  /\bAudio\b/,
  /HTMLAudioElement/,
  /\bsetInterval\b/,
  /\bsetTimeout\b/,
  /requestAnimationFrame/,
  /app\/internal\/prototypes/,
  /GreenIvoryEditorialPrototype/,
  /wedding\.elegant-editorial/,
  /elegant[-_ ]?editorial/i,
  /["'`]wedding\.[\w-]+\.v\d+/,
  /["']use client["']/,
];

/** RF-05B binding vocabulary: forbidden in RF-05A files only. */
const FORBIDDEN_RF05B_BINDING: readonly RegExp[] = [/RendererBinding/, /renderer-binding/, /BindingRegistry/];

/** RF-05C temporal behavior: forbidden in every RF-05A/RF-05B file. */
const FORBIDDEN_RF05C_TEMPORAL: readonly RegExp[] = [
  /countdown/i,
  /\bIntl\b/,
  /toLocale/,
  /get(UTC)?Day\b/,
  /lunar/i,
  /\bDate\b/,
  /calendar/i,
  /weekday/i,
];

/** RF-05B never consumes the RF-05A clock or event time; that is RF-05C. */
const FORBIDDEN_RF05B_CLOCK: readonly RegExp[] = [/nowEpochMs/, /ClockCapability/, /startsAt/, /\bclock\b/i];

/** Files that may import RF-04 compatibility modules (RF-05B composes RF-04, K10). */
function isRf05bFile(file: string): boolean {
  return (RF05B_PRODUCTION_FILES as readonly string[]).includes(file);
}

describe("RF-05 static boundary — scanner", () => {
  it("ignores comments but still sees code", () => {
    const sample = "/* window */\n// navigator.clipboard\nconst a = 1; // Date.now\nconst b = setTimeout;";
    const code = stripComments(sample);
    expect(code).not.toMatch(/window|navigator|Date\.now/);
    expect(code).toMatch(/\bsetTimeout\b/);
  });

  it("every listed RF-05 production file exists and is a .ts module", () => {
    for (const file of RF05_PRODUCTION_FILES) {
      expect(file.endsWith(".ts")).toBe(true);
      expect(existsSync(join(__dirname, "..", file))).toBe(true);
    }
  });
});

describe.each(RF05_PRODUCTION_FILES)("RF-05 static boundary — %s", (file) => {
  const code = stripComments(readSource(file));

  it("has no browser, network, database, clock, timer, randomness or prototype dependency", () => {
    for (const forbidden of FORBIDDEN_SIDE_EFFECTS) {
      expect(code).not.toMatch(forbidden);
    }
  });

  it("contains no RF-05C temporal code", () => {
    for (const forbidden of FORBIDDEN_RF05C_TEMPORAL) {
      expect(code).not.toMatch(forbidden);
    }
  });

  it("RF-05B files do no clock or event-time processing", () => {
    if (!isRf05bFile(file)) return;
    for (const forbidden of FORBIDDEN_RF05B_CLOCK) {
      expect(code).not.toMatch(forbidden);
    }
  });

  it("keeps RF-05B binding vocabulary out of RF-05A files", () => {
    if (isRf05bFile(file)) return;
    for (const forbidden of FORBIDDEN_RF05B_BINDING) {
      expect(code).not.toMatch(forbidden);
    }
  });

  it("imports only the shared domain, sibling modules and (type-only) React", () => {
    const specifiers = [...code.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of specifiers) {
      const allowed =
        specifier === "../domain" ||
        /^\.\/[a-z-]+$/.test(specifier) ||
        (specifier === "react" && file === REACT_TYPE_IMPORT_FILE);
      expect(allowed, `${file} imports "${specifier}"`).toBe(true);
    }
    expect(code).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
  });

  it("RF-05B composes the RF-04 modules and uses RF-05A component types only as types", () => {
    if (file !== "renderer-binding-registry.ts") return;
    expect(code).toMatch(/\bfrom\s+"\.\/renderer-registry"/);
    expect(code).toMatch(/\bprojectCompatibilityManifest\b[\s\S]*?\bfrom\s+"\.\/renderer-compatibility-manifest"/);
    expect(code).toMatch(/^import type \{[^}]*\} from "\.\/renderer-component";$/m);
    expect(code).not.toMatch(/^import \{[^}]*\} from "\.\/renderer-component";$/m);
  });

  it("uses React only as an erased type import", () => {
    const reactImports = [...code.matchAll(/^\s*import\b[^;]*?\bfrom\s+["']react(?:\/[^"']*)?["']/gm)].map(
      (match) => match[0].trim(),
    );
    if (file === REACT_TYPE_IMPORT_FILE) {
      expect(reactImports).toEqual(['import type { ComponentType } from "react"']);
    } else {
      expect(reactImports).toEqual([]);
      expect(code).not.toMatch(/["']react["']/);
    }
    expect(code).not.toMatch(/\bReact\.|createElement|\bjsxs?\s*\(/);
  });
});
