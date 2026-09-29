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

/** RF-05C: pure temporal + presentation derivations (the only temporal layer). */
const RF05C_PRODUCTION_FILES = [
  "civil-date-time.ts",
  "event-date-time-presentation.ts",
  "ceremony-countdown.ts",
  "ceremony-month-grid.ts",
] as const;

const RF05_PRODUCTION_FILES = [
  ...RF05A_PRODUCTION_FILES,
  ...RF05B_PRODUCTION_FILES,
  ...RF05C_PRODUCTION_FILES,
] as const;

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

/** RF-05C module specifiers; RF-05A/RF-05B never import them. */
const RF05C_MODULE_SPECIFIERS = RF05C_PRODUCTION_FILES.map((file) => `./${file.replace(/\.ts$/, "")}`);

/** The only modules RF-05C may import (K3: no RF-05B, RF-04 selection, React or browser code). */
const RF05C_ALLOWED_IMPORTS: readonly string[] = [
  "./civil-date-time",
  "./invitation-view-model-types",
  "./renderer-capabilities",
];

/** The only RF-05C file that reads timezone rules or the canonical timestamp gate. */
const RF05C_CIVIL_FILE = "civil-date-time.ts";

const STRICT_TIMESTAMPTZ_SPECIFIER = "../server/validation/timestamptz";

/**
 * RF-05C temporal code may use `Date.parse` on an explicit canonical value
 * and `Intl.DateTimeFormat` for timezone rules only. Everything else here is
 * forbidden: implicit/ambient time, Date objects, localized weekday text,
 * lunar handling (K32) and add-to-calendar integration (K34).
 */
const FORBIDDEN_RF05C_EXTRAS: readonly RegExp[] = [
  /toLocale/,
  /get(UTC)?Day\b/,
  /\bweekday\s*:\s*["'](long|short|narrow)["']/,
  /lunar/i,
  /\bics\b|VCALENDAR|google/i,
  /["']react["']/,
  /\bprocess\b/,
];

/** Files that may import RF-04 compatibility modules (RF-05B composes RF-04, K10). */
function isRf05bFile(file: string): boolean {
  return (RF05B_PRODUCTION_FILES as readonly string[]).includes(file);
}

function isRf05cFile(file: string): boolean {
  return (RF05C_PRODUCTION_FILES as readonly string[]).includes(file);
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

  it("RF-05A/RF-05B files contain no RF-05C temporal code", () => {
    if (isRf05cFile(file)) return;
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

  it("keeps RF-05B binding vocabulary out of RF-05A/RF-05C files", () => {
    if (isRf05bFile(file)) return;
    for (const forbidden of FORBIDDEN_RF05B_BINDING) {
      expect(code).not.toMatch(forbidden);
    }
  });

  it("imports only the shared domain, sibling modules and (type-only) React", () => {
    const specifiers = [...code.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of specifiers) {
      const allowed = isRf05cFile(file)
        ? RF05C_ALLOWED_IMPORTS.includes(specifier) ||
          (specifier === STRICT_TIMESTAMPTZ_SPECIFIER && file === RF05C_CIVIL_FILE)
        : specifier === "../domain" ||
          /^\.\/[a-z-]+$/.test(specifier) ||
          (specifier === "react" && file === REACT_TYPE_IMPORT_FILE);
      expect(allowed, `${file} imports "${specifier}"`).toBe(true);
    }
    expect(code).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
  });

  it("RF-05A/RF-05B files never import RF-05C modules", () => {
    if (isRf05cFile(file)) return;
    const specifiers = [...code.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of specifiers) {
      expect(RF05C_MODULE_SPECIFIERS, `${file} imports "${specifier}"`).not.toContain(specifier);
    }
  });

  it("RF-05C uses Date only as Date.parse and Intl only in the private civil module", () => {
    if (!isRf05cFile(file)) return;
    expect(code.replace(/\bDate\.parse\s*\(/g, "")).not.toMatch(/\bDate\b/);
    if (file === RF05C_CIVIL_FILE) {
      expect(code).toMatch(/\bnew Intl\.DateTimeFormat\(/);
      expect(code).toMatch(/^import \{ isValidTimestamptz \} from "\.\.\/server\/validation\/timestamptz";$/m);
    } else {
      expect(code).not.toMatch(/\bIntl\b|\bDate\.parse\b/);
    }
    for (const forbidden of FORBIDDEN_RF05C_EXTRAS) {
      expect(code).not.toMatch(forbidden);
    }
  });

  it("RF-05C imports ViewModel and capability modules as types only", () => {
    if (!isRf05cFile(file)) return;
    expect(code).not.toMatch(/^import \{[^}]*\} from "\.\/(invitation-view-model-types|renderer-capabilities)";$/m);
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

describe("RF-05 static boundary — RF-05C public surface", () => {
  it("never exports the private civil date/time module from the package index", () => {
    const indexCode = stripComments(readSource("index.ts"));
    expect(indexCode).not.toMatch(/civil-date-time/);
    for (const specifier of RF05C_MODULE_SPECIFIERS.filter((specifier) => specifier !== "./civil-date-time")) {
      expect(indexCode).toContain(`from "${specifier}"`);
    }
    expect(indexCode).not.toMatch(/export \*\s+from\s+"\.\/(event-date-time-presentation|ceremony-countdown|ceremony-month-grid)"/);
  });
});
