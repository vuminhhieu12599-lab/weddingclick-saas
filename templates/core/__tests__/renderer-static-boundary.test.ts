import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * RF-06A static boundary (docs/DECISIONS.md "RF-06-0 …" P2, P17, P26, P27,
 * P39, P45). A new RF-06 test: the frozen RF-05 static-boundary test is not
 * modified. Later RF-06 checkpoints extend these lists explicitly.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");

/** RF-06A production manifest foundation. */
const RF06A_MANIFEST_FILES = [
  "templates/core/renderer-manifest.ts",
  "templates/core/production-renderer-manifests.ts",
  "templates/wedding/elegant-editorial/v1/manifest.ts",
] as const;

/** RF-06A deterministic pipeline fixtures. */
const RF06A_FIXTURE_FILES = [
  "templates/core/fixtures/renderer-fixture-sources.ts",
  "templates/core/fixtures/fixture-media-resolver.ts",
  "templates/core/fixtures/renderer-fixture-pipeline.ts",
] as const;

const RF06A_FILES = [...RF06A_MANIFEST_FILES, ...RF06A_FIXTURE_FILES] as const;

/** P17/P45: the only `lib/server/**` module RF-06A may import, and only from the manifest validator. */
const TASK028_VALIDATOR = "lib/server/project-design/validate-template-design-manifest.ts";
const TASK028_VALIDATOR_IMPORTER = "templates/core/renderer-manifest.ts";

/** Exact import allowlist per RF-06A file, as repository-relative module paths (no extension). */
const ALLOWED_IMPORTS: Readonly<Record<(typeof RF06A_FILES)[number], readonly string[]>> = {
  "templates/core/renderer-manifest.ts": [
    "lib/domain",
    "lib/invitation-rendering/renderer-compatibility-manifest",
    "lib/server/project-design/validate-template-design-manifest",
  ],
  "templates/core/production-renderer-manifests.ts": [
    "lib/invitation-rendering/renderer-registry",
    "templates/wedding/elegant-editorial/v1/manifest",
    // VH-01: the second explicit production manifest.
    "templates/wedding/vietnamese-heritage/v1/manifest",
    "templates/core/renderer-manifest",
  ],
  "templates/wedding/elegant-editorial/v1/manifest.ts": ["templates/core/renderer-manifest"],
  "templates/core/fixtures/renderer-fixture-sources.ts": [
    "lib/domain",
    "lib/invitation-rendering/invitation-view-model-types",
    "lib/invitation-rendering/snapshot-payload-types",
    "templates/wedding/elegant-editorial/v1/manifest",
  ],
  "templates/core/fixtures/fixture-media-resolver.ts": [
    "lib/invitation-rendering/invitation-view-model-types",
    "templates/core/fixtures/renderer-fixture-sources",
  ],
  "templates/core/fixtures/renderer-fixture-pipeline.ts": [
    "lib/invitation-rendering/build-invitation-view-model",
    "lib/invitation-rendering/build-snapshot-payload",
    "lib/invitation-rendering/invitation-view-model-types",
    "lib/invitation-rendering/renderer-selection",
    "lib/invitation-rendering/resolve-snapshot-media",
    "lib/invitation-rendering/snapshot-payload-types",
    "templates/core/production-renderer-manifests",
    "templates/core/fixtures/fixture-media-resolver",
    "templates/core/fixtures/renderer-fixture-sources",
  ],
};

/** Removes block and line comments so documentation prose is not scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

interface ImportStatement {
  specifier: string;
  typeOnly: boolean;
}

function importsOf(source: string): ImportStatement[] {
  const statements: ImportStatement[] = [];
  const pattern = /^\s*(import|export)\s+(type\s+)?[^;]*?\sfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
  for (const match of stripComments(source).matchAll(pattern)) {
    const specifier = match[3] ?? match[4];
    if (specifier !== undefined) statements.push({ specifier, typeOnly: match[2] !== undefined });
  }
  return statements;
}

/** Resolves a relative specifier from `file` to a repository-relative module path. */
function resolveSpecifier(file: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  const fileDir = join(REPO_ROOT, file, "..");
  return toPosix(relative(REPO_ROOT, join(fileDir, specifier)));
}

function listSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") files.push(...listSources(path));
    } else {
      files.push(toPosix(relative(REPO_ROOT, path)));
    }
  }
  return files;
}

/** Forbidden in every RF-06A file (code only; comments are stripped). */
const RF06A_FORBIDDEN: readonly [string, RegExp][] = [
  ["React import", /from\s+["']react(-dom)?(\/[^"']*)?["']/],
  ["React JSX/runtime", /\bReact\b|\bjsx\b|createElement/],
  ["next import", /from\s+["']next(\/[^"']*)?["']/],
  ["next/font", /next\/font/],
  ["font loader call", /\b(Great_Vibes|Source_Serif_4|Inter)\s*\(/],
  ["use client", /["']use client["']/],
  ["use server", /["']use server["']/],
  ["CSS import", /\.css["']/],
  ["tsx import", /\.tsx["']/],
  ["Supabase", /supabase/i],
  ["service_role", /service_role/],
  ["process.env", /process\.env/],
  ["fetch", /\bfetch\s*\(/],
  ["window", /\bwindow\b/],
  ["document", /\bdocument\b/],
  ["navigator", /\bnavigator\b/],
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["Audio", /\bAudio\b|HTMLAudioElement/],
  ["execCommand", /execCommand/],
  ["Date.now", /Date\.now/],
  ["new Date", /\bnew Date\b/],
  ["performance.now", /performance\.now/],
  ["Math.random", /Math\.random/],
  ["crypto randomness", /randomUUID|getRandomValues/],
  ["timers", /\bset(Timeout|Interval)\b|requestAnimationFrame/],
  ["dynamic import", /\bimport\s*\(/],
  ["require", /\brequire\s*\(/],
  ["import.meta", /import\.meta/],
  ["filesystem", /["']node:|["']fs["']|readdir|readFile|\bglob\b/],
  ["prototype app import", /app\/internal\/prototypes/],
  ["prototype assets", /public\/prototypes/],
  ["prototype component", /GreenIvoryEditorialPrototype/],
  ["legacy direction", /_directions/],
  ["binding registry (RF-06B)", /renderer-binding|BindingRegistry|RendererBinding/],
  ["renderer component (RF-06B)", /renderer-component|InvitationRendererComponent/],
  ["host (RF-06B)", /InvitationRendererHost|renderer-host/],
  ["capabilities (RF-06C)", /renderer-capabilities|rsvp-capability|Capability/],
  ["external font URL", /fonts\.(googleapis|gstatic)\.com/],
];

describe("RF-06A files", () => {
  it("every listed file exists and is a .ts module", () => {
    for (const file of RF06A_FILES) {
      expect(file.endsWith(".ts")).toBe(true);
      expect(() => readRepoFile(file)).not.toThrow();
    }
  });

  it.each(RF06A_FILES)("%s contains no forbidden runtime, client, React, font or discovery code", (file) => {
    const code = stripComments(readRepoFile(file));
    for (const [label, pattern] of RF06A_FORBIDDEN) {
      expect(pattern.test(code), `${file}: ${label}`).toBe(false);
    }
  });

  it.each(RF06A_FILES)("%s imports only its exact allowlist", (file) => {
    const resolved = importsOf(readRepoFile(file)).map((statement) => resolveSpecifier(file, statement.specifier));
    expect(resolved.length).toBeGreaterThan(0);
    for (const modulePath of resolved) {
      expect(ALLOWED_IMPORTS[file], `${file} imports ${modulePath}`).toContain(modulePath);
    }
  });

  it("only the manifest validator module imports lib/server, and only the Task 028 validator", () => {
    for (const file of RF06A_FILES) {
      const serverImports = importsOf(readRepoFile(file))
        .map((statement) => resolveSpecifier(file, statement.specifier))
        .filter((modulePath) => modulePath.startsWith("lib/server"));
      if (file === TASK028_VALIDATOR_IMPORTER) {
        expect(serverImports).toStrictEqual([TASK028_VALIDATOR.replace(/\.ts$/, "")]);
      } else {
        expect(serverImports, file).toStrictEqual([]);
      }
    }
  });

  it("the reused Task 028 validator has a pure, type-only import graph (P45)", () => {
    const statements = importsOf(readRepoFile(TASK028_VALIDATOR));
    expect(statements).toStrictEqual([{ specifier: "../../domain", typeOnly: true }]);
    const code = stripComments(readRepoFile(TASK028_VALIDATOR));
    for (const pattern of [/supabase/i, /service_role/, /process\.env/, /\bfetch\s*\(/, /["']use client["']/]) {
      expect(pattern.test(code)).toBe(false);
    }
  });

  it("the Elegant Editorial v1 manifest module imports types only (P17)", () => {
    const statements = importsOf(readRepoFile("templates/wedding/elegant-editorial/v1/manifest.ts"));
    expect(statements.length).toBeGreaterThan(0);
    expect(statements.every((statement) => statement.typeOnly)).toBe(true);
  });

  it("the production manifest list is explicit (no discovery) and keys are not hand-typed there", () => {
    const code = stripComments(readRepoFile("templates/core/production-renderer-manifests.ts"));
    // VH-01: still one explicit, ordered literal list, now with the second manifest.
    expect(code).toContain(
      "validateProductionRendererManifests([ELEGANT_EDITORIAL_V1_MANIFEST, VIETNAMESE_HERITAGE_V1_MANIFEST])",
    );
    expect(/["'`]wedding\.[\w-]+\.v\d+/.test(code)).toBe(false);
  });

  it("the production renderer key literal appears only in the v1 manifest constant", () => {
    for (const file of RF06A_FILES) {
      const hasLiteral = /["'`]wedding\.elegant-editorial\.v1["'`]/.test(stripComments(readRepoFile(file)));
      expect(hasLiteral, file).toBe(file === "templates/wedding/elegant-editorial/v1/manifest.ts");
    }
  });
});

/**
 * RF-06C client-runtime files (docs/DECISIONS.md "RF-06-0 …" P24, P25,
 * P30, P34–P36). Declared before the first describe that reads them at
 * collection time; the RF-06C rules themselves are at the end of the file.
 */
const RF06C_DIR = "templates/core/client";
const RF06C_CLIPBOARD_MODULE = `${RF06C_DIR}/clipboard-capability.ts`;
const RF06C_MUSIC_MODULE = `${RF06C_DIR}/music-capability.ts`;
const RF06C_CLOCK_MODULE = `${RF06C_DIR}/clock-capability.ts`;
const RF06C_RUNTIME_MODULE = `${RF06C_DIR}/runtime-capabilities.ts`;
const RF06C_HOST_CORE_MODULE = `${RF06C_DIR}/invitation-renderer-host-core.tsx`;
const RF06C_FILES = [
  RF06C_CLIPBOARD_MODULE,
  RF06C_MUSIC_MODULE,
  RF06C_CLOCK_MODULE,
  RF06C_RUNTIME_MODULE,
  RF06C_HOST_CORE_MODULE,
] as const;

/**
 * RF-06D interactive islands (docs/DECISIONS.md "RF-06-0 …" P7, P13,
 * P30–P35). Declared here for the tree rule; the RF-06D rules themselves are
 * at the end of the file. Islands hold every hook, control and capability
 * action; the models are pure TypeScript.
 */
const RF06D_DIR = "templates/wedding/elegant-editorial/v1/interactive";
const RF06D_OPENING = `${RF06D_DIR}/opening-interaction.tsx`;
const RF06D_COUNTDOWN = `${RF06D_DIR}/countdown.tsx`;
const RF06D_MUSIC = `${RF06D_DIR}/music-control.tsx`;
const RF06D_GIFT_DIALOG = `${RF06D_DIR}/gift-dialog.tsx`;
const RF06D_COPY_BUTTON = `${RF06D_DIR}/copy-account-button.tsx`;
const RF06D_RSVP = `${RF06D_DIR}/rsvp.tsx`;
const RF06D_OPENING_STATE = `${RF06D_DIR}/opening-state.ts`;
const RF06D_RSVP_MODEL = `${RF06D_DIR}/rsvp-model.ts`;
/** RF-06D visual/interaction remediation: Task029 section reveal (Design Baseline B5 item 19). */
const RF06D_REVEAL = `${RF06D_DIR}/section-reveal.tsx`;
const RF06D_ISLAND_FILES = [
  RF06D_OPENING,
  RF06D_COUNTDOWN,
  RF06D_MUSIC,
  RF06D_GIFT_DIALOG,
  RF06D_COPY_BUTTON,
  RF06D_RSVP,
  RF06D_REVEAL,
] as const;
const RF06D_MODEL_FILES = [RF06D_OPENING_STATE, RF06D_RSVP_MODEL] as const;
const RF06D_FILES = [...RF06D_ISLAND_FILES, ...RF06D_MODEL_FILES] as const;

describe("templates/** production tree (P39)", () => {
  const sources = listSources(TEMPLATES_ROOT);

  it("RF-06A lists are unchanged by RF-06B", () => {
    expect([...RF06A_FILES]).toStrictEqual([
      "templates/core/renderer-manifest.ts",
      "templates/core/production-renderer-manifests.ts",
      "templates/wedding/elegant-editorial/v1/manifest.ts",
      "templates/core/fixtures/renderer-fixture-sources.ts",
      "templates/core/fixtures/fixture-media-resolver.ts",
      "templates/core/fixtures/renderer-fixture-pipeline.ts",
    ]);
    expect(Object.keys(ALLOWED_IMPORTS).sort()).toStrictEqual([...RF06A_FILES].sort());
  });

  // RF-06B extension: the tree is exactly the RF-06A files plus the explicit
  // RF-06B files; React, CSS and the provenance note exist only there.
  // RF-06C extension: plus exactly the RF-06C client-runtime files.
  // RF-06D extension: plus exactly the RF-06D islands and pure models.
  // VH-01 extension: plus exactly the Vietnamese Heritage v1 files (rules at the end of this file).
  // TE-02 extension: plus exactly the editor-manifest files (rules in editor-manifest-static-boundary.test.ts).
  it("templates/** contains exactly the RF-06A, RF-06B, RF-06C, RF-06D, VH-01 and TE-02 files", () => {
    expect([...sources].sort()).toStrictEqual(
      [...RF06A_FILES, ...RF06B_TEMPLATE_FILES, ...RF06C_FILES, ...RF06D_FILES, ...VH01_FILES, ...VH02B_ISLAND_FILES, ...TE02_FILES].sort(),
    );
  });

  /** P39 universal rules; RF-06C adds its named adapter exceptions explicitly. */
  const UNIVERSAL_FORBIDDEN: readonly RegExp[] = [
    /app\/internal\/prototypes/,
    /public\/prototypes/,
    /supabase/i,
    /service_role/,
    /process\.env/,
    /\bnavigator\b/,
    /\bAudio\b/,
    /Date\.now/,
    /execCommand/,
    /fonts\.(googleapis|gstatic)\.com/,
  ];

  /**
   * RF-06C: the only named P39 adapter exceptions, one least-privilege
   * module per browser global. No other file, and no directory-wide rule.
   */
  const UNIVERSAL_EXCEPTIONS: ReadonlyMap<RegExp, string> = new Map([
    [UNIVERSAL_FORBIDDEN[5] as RegExp, RF06C_CLIPBOARD_MODULE],
    [UNIVERSAL_FORBIDDEN[6] as RegExp, RF06C_MUSIC_MODULE],
    [UNIVERSAL_FORBIDDEN[7] as RegExp, RF06C_CLOCK_MODULE],
  ]);

  it("the RF-06C exceptions cover exactly navigator, Audio and Date.now", () => {
    expect([...UNIVERSAL_EXCEPTIONS.keys()].map(String)).toStrictEqual(["/\\bnavigator\\b/", "/\\bAudio\\b/", "/Date\\.now/"]);
  });

  it.each(sources)("%s obeys the universal templates/** rules", (file) => {
    const code = stripComments(readRepoFile(file));
    for (const pattern of UNIVERSAL_FORBIDDEN) {
      if (UNIVERSAL_EXCEPTIONS.get(pattern) === file) continue;
      expect(pattern.test(code), `${file}: ${String(pattern)}`).toBe(false);
    }
  });
});

// ===========================================================================
// RF-06B extension (docs/DECISIONS.md "RF-06-0 …" P2–P6, P22–P27, P38–P39).
// Everything above is the unchanged RF-06A boundary; RF-06B adds explicit
// lists and rules here and weakens none of them.
// ===========================================================================

// RSVP completion amendment (2026-10-01): MAYBE is a canonical attendance status, so the former
// "no MAYBE" rules are removed from every forbidden-pattern list below.
const V1 = "templates/wedding/elegant-editorial/v1";

/** RF-06B core: client binding registry and the client host. */
const RF06B_CORE_FILES = ["templates/core/production-renderer-bindings.ts", "templates/core/invitation-renderer-host.tsx"] as const;

/** RF-06B Elegant Editorial v1 static renderer modules. */
const RF06B_RENDERER_FILES = [
  `${V1}/elegant-editorial-v1.tsx`,
  `${V1}/copy.ts`,
  `${V1}/palette.ts`,
  `${V1}/fonts.ts`,
  `${V1}/sections/calendar.tsx`,
  `${V1}/sections/ceremony.tsx`,
  `${V1}/sections/closing.tsx`,
  `${V1}/sections/couple.tsx`,
  `${V1}/sections/date-text.ts`,
  `${V1}/sections/decor.tsx`,
  // Micro-Checkpoint 1: pure two-token decorative couple-name presentation (Product Owner ruling).
  `${V1}/sections/display-name.ts`,
  `${V1}/sections/events.tsx`,
  `${V1}/sections/families.tsx`,
  `${V1}/sections/gallery.tsx`,
  `${V1}/sections/gift.tsx`,
  `${V1}/sections/hero.tsx`,
  `${V1}/sections/invitation-message.tsx`,
  `${V1}/sections/love-story.tsx`,
  // Micro-Checkpoint 8: Task029 Timeline (RF7 Timeline amendment).
  `${V1}/sections/timeline.tsx`,
  // Micro-Checkpoint 9: Task029 Dress Code (RF7 Dress Code amendment).
  `${V1}/sections/dress-code.tsx`,
  // Media batch: Task029 Photo Story (RF7 Photo Story amendment).
  `${V1}/sections/photo-story.tsx`,
  `${V1}/sections/media-image.tsx`,
  `${V1}/sections/opening-cover.tsx`,
] as const;

const RF06B_CSS_FILE = `${V1}/elegant-editorial-v1.module.css`;
const RF06B_PROVENANCE_FILE = `${V1}/PROVENANCE.md`;

const RF06B_CODE_FILES = [...RF06B_CORE_FILES, ...RF06B_RENDERER_FILES] as const;
const RF06B_TEMPLATE_FILES = [...RF06B_CODE_FILES, RF06B_CSS_FILE, RF06B_PROVENANCE_FILE] as const;

const LIB = "lib/invitation-rendering";
const CSS_MODULE = `${V1}/elegant-editorial-v1.module.css`;
const SECTION_COMMON = [`${V1}/copy`, CSS_MODULE];

/** Exact import allowlist per RF-06B code file (repository-relative, no extension; CSS keeps its extension). */
const RF06B_ALLOWED_IMPORTS: Readonly<Record<(typeof RF06B_CODE_FILES)[number], readonly string[]>> = {
  "templates/core/production-renderer-bindings.ts": [
    `${LIB}/renderer-compatibility-manifest`,
    `${LIB}/renderer-binding-registry`,
    `${LIB}/renderer-component`,
    `${V1}/elegant-editorial-v1`,
    // VH-01: the second explicit component binding.
    "templates/wedding/vietnamese-heritage/v1/vietnamese-heritage-v1",
    "templates/core/production-renderer-manifests",
    "templates/core/renderer-manifest",
  ],
  // RF-06C: the host now delegates resolution and capability construction to the internal client core.
  "templates/core/invitation-renderer-host.tsx": [
    `${LIB}/invitation-view-model-types`,
    `${LIB}/renderer-selection`,
    "templates/core/client/invitation-renderer-host-core",
  ],
  [`${V1}/elegant-editorial-v1.tsx`]: [
    `${LIB}/ceremony-month-grid`,
    `${LIB}/event-date-time-presentation`,
    `${LIB}/renderer-component`,
    `${V1}/copy`,
    CSS_MODULE,
    `${V1}/fonts`,
    `${V1}/palette`,
    // RF-06D: the capability-gated islands the root renders.
    `${V1}/interactive/countdown`,
    `${V1}/interactive/music-control`,
    `${V1}/interactive/rsvp`,
    `${V1}/interactive/section-reveal`,
    ...[
      "calendar",
      "ceremony",
      "closing",
      "couple",
      "dress-code",
      "events",
      "families",
      "gallery",
      "gift",
      "hero",
      "invitation-message",
      "love-story",
      "opening-cover",
      "photo-story",
      "timeline",
    ].map((section) => `${V1}/sections/${section}`),
  ],
  [`${V1}/copy.ts`]: [],
  [`${V1}/palette.ts`]: ["react"],
  [`${V1}/fonts.ts`]: ["next/font/google"],
  [`${V1}/sections/calendar.tsx`]: [`${LIB}/ceremony-month-grid`, ...SECTION_COMMON, `${V1}/sections/decor`],
  [`${V1}/sections/ceremony.tsx`]: [`${LIB}/event-date-time-presentation`, `${LIB}/invitation-view-model-types`, ...SECTION_COMMON],
  [`${V1}/sections/closing.tsx`]: [
    `${LIB}/event-date-time-presentation`,
    `${LIB}/invitation-view-model-types`,
    ...SECTION_COMMON,
    `${V1}/sections/date-text`,
    `${V1}/sections/decor`,
    `${V1}/sections/display-name`,
  ],
  // Micro-Checkpoint 6: RESOLVED portraits render through the shared MediaImage (RF7 Product Owner amendment).
  [`${V1}/sections/couple.tsx`]: [
    `${LIB}/invitation-view-model-types`,
    ...SECTION_COMMON,
    `${V1}/sections/display-name`,
    `${V1}/sections/media-image`,
  ],
  [`${V1}/sections/date-text.ts`]: [`${LIB}/event-date-time-presentation`],
  [`${V1}/sections/decor.tsx`]: [CSS_MODULE],
  [`${V1}/sections/display-name.ts`]: [],
  [`${V1}/sections/events.tsx`]: [
    `${LIB}/event-date-time-presentation`,
    `${LIB}/invitation-view-model-types`,
    ...SECTION_COMMON,
    `${V1}/sections/date-text`,
  ],
  [`${V1}/sections/families.tsx`]: [`${LIB}/invitation-view-model-types`, ...SECTION_COMMON, `${V1}/sections/decor`],
  [`${V1}/sections/gallery.tsx`]: [`${LIB}/invitation-view-model-types`, ...SECTION_COMMON, `${V1}/sections/media-image`],
  [`${V1}/sections/gift.tsx`]: [
    `${LIB}/invitation-view-model-types`,
    `${LIB}/wedding-domain-types`,
    ...SECTION_COMMON,
    `${V1}/sections/media-image`,
    // RF-06D: the sides render inside the dialog island, with the copy island.
    `${V1}/interactive/copy-account-button`,
    `${V1}/interactive/gift-dialog`,
  ],
  [`${V1}/sections/hero.tsx`]: [
    `${LIB}/event-date-time-presentation`,
    `${LIB}/invitation-view-model-types`,
    ...SECTION_COMMON,
    `${V1}/sections/date-text`,
    `${V1}/sections/decor`,
    `${V1}/sections/display-name`,
    `${V1}/sections/media-image`,
  ],
  [`${V1}/sections/invitation-message.tsx`]: SECTION_COMMON,
  // Media batch: the RESOLVED Love Story photo renders through the shared MediaImage.
  [`${V1}/sections/love-story.tsx`]: [`${LIB}/invitation-view-model-types`, ...SECTION_COMMON, `${V1}/sections/media-image`],
  // Adaptive Photo Story (PO): the pure shared orientation helper (RF-03 M13 shared-presentation fallback).
  [`${V1}/sections/photo-story.tsx`]: [
    `${LIB}/invitation-view-model-types`,
    `${LIB}/media-orientation`,
    ...SECTION_COMMON,
    `${V1}/sections/media-image`,
  ],
  [`${V1}/sections/timeline.tsx`]: [`${LIB}/invitation-view-model-types`, ...SECTION_COMMON],
  [`${V1}/sections/dress-code.tsx`]: [`${LIB}/invitation-view-model-types`, ...SECTION_COMMON],
  [`${V1}/sections/media-image.tsx`]: [`${LIB}/invitation-view-model-types`],
  // RF-06D: the envelope artwork moved into the opening island, which imports decor itself.
  [`${V1}/sections/opening-cover.tsx`]: [
    `${LIB}/event-date-time-presentation`,
    `${LIB}/invitation-view-model-types`,
    ...SECTION_COMMON,
    `${V1}/sections/date-text`,
    `${V1}/sections/display-name`,
    `${V1}/interactive/opening-interaction`,
  ],
};

/** Forbidden in every RF-06B code file (comments stripped). Exceptions are per-rule below. */
const RF06B_FORBIDDEN: readonly [string, RegExp][] = [
  ["prototype app import", /app\/internal\/prototypes/],
  ["prototype assets", /public\/prototypes|\/prototypes\//],
  ["prototype component", /GreenIvoryEditorialPrototype/],
  ["legacy direction", /_directions/],
  ["Supabase", /supabase/i],
  ["service_role", /service_role/],
  ["lib/server import", /lib\/server|\.\.\/server\//],
  ["DB client", /createClient|\bpg\b|postgres/i],
  ["process.env", /process\.env/],
  ["fetch", /\bfetch\s*\(/],
  ["window", /\bwindow\b/],
  ["document", /\bdocument\b/],
  ["navigator", /\bnavigator\b/],
  ["localStorage", /\blocalStorage\b/],
  ["sessionStorage", /\bsessionStorage\b/],
  ["Audio", /\bAudio\b|HTMLAudioElement|<audio/],
  ["execCommand", /execCommand/],
  ["Date.now", /Date\.now/],
  ["new Date", /\bnew Date\b|\bDate\(/],
  ["Intl / locale formatting", /\bIntl\b|toLocale/],
  ["Date getters", /get(UTC)?(Day|Date|Month|FullYear|Hours)\b/],
  ["performance.now", /performance\.now/],
  ["Math.random", /Math\.random/],
  ["crypto randomness", /randomUUID|getRandomValues/],
  ["timers", /\bset(Timeout|Interval)\b|requestAnimationFrame/],
  ["IntersectionObserver / matchMedia", /IntersectionObserver|matchMedia/],
  ["React hooks (RF-06B is static)", /\buse(State|Effect|LayoutEffect|InsertionEffect|Ref|Memo|Callback|Reducer|SyncExternalStore|Context|Transition|Optimistic|ActionState)\b/],
  ["framer-motion", /framer-motion|\bmotion\./],
  ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/],
  ["dynamic import", /\bimport\s*\(/],
  ["require", /\brequire\s*\(/],
  ["import.meta", /import\.meta/],
  ["filesystem", /["']node:|["']fs["']|readdir|readFile|\bglob\b/],
  ["use server", /["']use server["']/],
  ["common QR", /QR_COMMON|commonMediaId|qr\.common/],
  ["additional note", /additional_?note/i],
  ["prototype location fiction", /Đà Nẵng/],
  ["external font URL", /fonts\.(googleapis|gstatic)\.com/],
  ["review frame width", /--frame-width/],
  ["RF-06C/D capability or interaction", /\bonClick\b|<button|<form|<input|<dialog|role="dialog"|copyText|\.play\(|nowEpochMs/],
  // RF-06C safe follow-up hardening (RF-06B independent review).
  ["Date.parse / Date.UTC", /Date\.parse|Date\.UTC/],
  ["form events (RF-06D)", /\bonSubmit\b|\bonChange\b/],
  ["select / textarea (RF-06D)", /<select|<textarea/],
];

/** The only RF-06B module allowed to touch next/font. */
const FONTS_MODULE = `${V1}/fonts.ts`;
/** The only RF-06B module allowed to be a client boundary. */
const HOST_MODULE = "templates/core/invitation-renderer-host.tsx";
/** The only RF-06B module allowed to import renderer components and pair a key with one. */
const BINDINGS_MODULE = "templates/core/production-renderer-bindings.ts";

function codeOf(file: string): string {
  return stripComments(readRepoFile(file));
}

describe("RF-06B template files", () => {
  // VH-01 extension: the Vietnamese Heritage v1 renderer files and its one CSS module are the only additions.
  it("every listed file exists; .tsx and CSS live only in the RF-06B renderer/host scope (plus the RF-06C host core, RF-06D islands and VH-01 renderer)", () => {
    for (const file of RF06B_TEMPLATE_FILES) expect(() => readRepoFile(file), file).not.toThrow();
    const sources = listSources(TEMPLATES_ROOT);
    for (const file of sources.filter((source) => /\.(tsx|css)$/.test(source))) {
      expect(
        [
          HOST_MODULE,
          RF06C_HOST_CORE_MODULE,
          RF06B_CSS_FILE,
          ...RF06B_RENDERER_FILES,
          ...RF06D_ISLAND_FILES,
          VH01_CSS_FILE,
          ...VH01_RENDERER_FILES,
          ...VH02B_ISLAND_FILES,
        ],
        file,
      ).toContain(file);
    }
    expect(sources.filter((source) => source.endsWith(".css")).sort()).toStrictEqual([RF06B_CSS_FILE, VH01_CSS_FILE].sort());
  });

  it.each(RF06B_CODE_FILES)("%s contains no forbidden runtime, data, browser, prototype or interaction code", (file) => {
    const code = codeOf(file);
    for (const [label, pattern] of RF06B_FORBIDDEN) {
      expect(pattern.test(code), `${file}: ${label}`).toBe(false);
    }
  });

  it.each(RF06B_CODE_FILES)("%s imports only its exact allowlist", (file) => {
    const resolved = importsOf(readRepoFile(file)).map((statement) => resolveSpecifier(file, statement.specifier));
    expect([...resolved].sort(), file).toStrictEqual([...new Set(RF06B_ALLOWED_IMPORTS[file])].sort());
  });

  it("only fonts.ts touches next/font, and it uses only next/font/google", () => {
    for (const file of RF06B_CODE_FILES) {
      const code = codeOf(file);
      expect(/next\/font/.test(code), file).toBe(file === FONTS_MODULE);
      expect(/next\/font\/local/.test(code), file).toBe(false);
      expect(/\b(Great_Vibes|Source_Serif_4|Inter)\s*\(/.test(code), file).toBe(file === FONTS_MODULE);
    }
  });

  it("only the host is a client boundary; nothing else declares 'use client'", () => {
    for (const file of RF06B_CODE_FILES) {
      const source = readRepoFile(file);
      expect(/["']use client["']/.test(source), file).toBe(file === HOST_MODULE);
    }
    expect(readRepoFile(HOST_MODULE).startsWith('"use client";\n')).toBe(true);
  });

  it("only the binding module imports a renderer component; renderer files never see manifests, registries, fixtures or the host", () => {
    for (const file of RF06B_CODE_FILES) {
      const imports = importsOf(readRepoFile(file)).map((statement) => resolveSpecifier(file, statement.specifier));
      const importsRenderer = imports.includes(`${V1}/elegant-editorial-v1`);
      expect(importsRenderer, file).toBe(file === BINDINGS_MODULE);
    }
    for (const file of RF06B_RENDERER_FILES) {
      const imports = importsOf(readRepoFile(file)).map((statement) => resolveSpecifier(file, statement.specifier));
      for (const modulePath of imports) {
        expect(modulePath, file).not.toMatch(
          /manifest(?!\.)|renderer-registry|renderer-binding|renderer-selection$|production-renderer|fixtures|renderer-host|renderer-capabilities|rsvp-capability|renderer-harness/,
        );
      }
    }
  });

  it("the production key literal appears among RF-06B files only in the binding table", () => {
    for (const file of RF06B_CODE_FILES) {
      const hasLiteral = /["'`]wedding\.elegant-editorial\.v1["'`]/.test(codeOf(file));
      expect(hasLiteral, file).toBe(file === BINDINGS_MODULE);
    }
  });

  it("the binding module derives entries from the validated manifest list, not the raw v1 constant", () => {
    const code = codeOf(BINDINGS_MODULE);
    expect(code).toContain("PRODUCTION_RENDERER_MANIFESTS");
    expect(code).toContain("createInvitationRendererBindingRegistry(entries)");
    expect(code).toContain("projectCompatibilityManifest(manifest.compatibility)");
    expect(code).not.toMatch(/ELEGANT_EDITORIAL_V1_MANIFEST|v1\/manifest/);
    expect(code).not.toMatch(/\bdefault\b|fallback|latest|alias/i);
  });

  // RF-06C replacement of the RF-06B "empty capabilities" assertion: the host
  // forwards exactly its three serializable props to the client core.
  it("the host forwards exactly its three props to the client core and takes no capability input", () => {
    const code = codeOf(HOST_MODULE);
    expect(code).toMatch(
      /return <InvitationRendererHostCore rendererKey=\{rendererKey\} viewModel=\{viewModel\} sections=\{sections\} \/>;/,
    );
    expect(code).not.toMatch(/\btry\b|\bcatch\b|capabilityOverrides|harnessCapabilities|capabilities|rsvp/i);
    const props = /interface InvitationRendererHostProps \{([\s\S]*?)\}/.exec(code)?.[1] ?? "";
    expect([...props.matchAll(/readonly (\w+):/g)].map((match) => match[1])).toStrictEqual([
      "rendererKey",
      "viewModel",
      "sections",
    ]);
  });

  // RF-06D replacement: the root now reads `capabilities`, but only to gate
  // its islands by presence, and still reads nothing but the K6 props.
  it("the renderer root reads only the K6 props, never a manifest prop, and uses capabilities only as presence gates", () => {
    const code = codeOf(`${V1}/elegant-editorial-v1.tsx`);
    expect(code).toMatch(
      /export function ElegantEditorialV1\(\{ viewModel, sections, capabilities \}: InvitationRendererPropsV1\)/,
    );
    expect(code).not.toMatch(/manifest|rendererKey/);
    expect(code.match(/capabilities\.\w+/g)?.sort()).toStrictEqual(
      [
        "capabilities.clipboard",
        "capabilities.clock",
        "capabilities.clock",
        "capabilities.music",
        "capabilities.music",
        "capabilities.rsvp",
        "capabilities.rsvp",
      ].sort(),
    );
    expect(code).toContain(
      "{capabilities.clock !== undefined ? <Countdown ceremony={ceremony} clock={capabilities.clock} /> : null}",
    );
    expect(code).toContain(
      "{sections.music && capabilities.music !== undefined ? <MusicControl music={capabilities.music} /> : null}",
    );
    // Micro-Checkpoint 10: RSVP receives only the capability; no guest data (the name input always starts empty).
    expect(code).toContain("{capabilities.rsvp !== undefined ? <Rsvp rsvp={capabilities.rsvp} /> : null}");
    expect(code.match(/<SectionReveal \/>/g)).toHaveLength(1);
    expect(code).toMatch(/clipboard=\{capabilities\.clipboard\}/);
  });
});

describe("RF-06B renderer CSS", () => {
  const css = readRepoFile(RF06B_CSS_FILE);
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it.each([
    ["runtime @import", /@import/],
    ["external/url resource", /url\(|https?:/],
    ["Tailwind directive", /@(tailwind|apply|layer|theme)\b/],
    ["global selector", /:global|(^|[\s,}])(html|body|:root)\b/m],
    ["viewport height", /\b100vh\b|\d+(\.\d+)?vh\b/],

    ["review frame width", /--frame-width/],
    ["prototype/global fonts", /Dancing Script|Playfair|Iowan/],
    ["!important", /!important/],
  ])("has no %s", (_label, pattern) => {
    expect(pattern.test(cssCode)).toBe(false);
  });

  /** Splits a selector list on top-level commas only (not inside `:where(...)`). */
  function splitSelectorList(list: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of list) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    parts.push(current.trim());
    return parts;
  }

  /** Returns the body of the first `@media <query> {…}` block (brace-matched), or null. */
  function mediaBlock(source: string, query: string): string | null {
    const start = source.indexOf(`@media ${query} {`);
    if (start === -1) return null;
    let depth = 0;
    for (let index = source.indexOf("{", start); index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      if (depth === 0) return source.slice(source.indexOf("{", start) + 1, index);
    }
    return null;
  }

  // RF-06D visual/interaction remediation (Design Baseline B5 items 4, 10, 18, 19):
  // keyframes are allowed only for the named Task029 motions, and exactly three
  // gentle loops exist (envelope float while sealed, calendar heart, music while
  // PLAYING). Every animation is switched off under reduced motion, except the
  // opening settle marker, which fires at once there instead of waiting.
  it("keyframes only for the named Task029 motions; infinite only for the three approved loops", () => {
    const keyframes = [...cssCode.matchAll(/@keyframes ([\w-]+)/g)].map((match) => match[1]).sort();
    expect(keyframes).toStrictEqual(
      [
        "ee-calendar-heart-pulse",
        "ee-envelope-float",
        "ee-music-pulse",
        "ee-opening-card-rise",
        "ee-opening-dissolve",
        "ee-opening-hero-in",
        "ee-opening-settle",
      ].sort(),
    );
    const loops = [...cssCode.matchAll(/([^{}]+)\{[^{}]*\binfinite\b[^{}]*\}/g)].map((match) => (match[1] as string).trim()).sort();
    expect(loops).toStrictEqual(
      [".calendarHeart", ".music[data-music-status=\"playing\"] .musicGlyph", ".openingEnvelopeFloat"].sort(),
    );
  });

  it("every RF-06D animation is removed under prefers-reduced-motion: reduce (the settle marker only becomes immediate)", () => {
    const reduceQuery = "(prefers-reduced-motion: reduce)";
    const reduced = mediaBlock(cssCode, reduceQuery) ?? "";
    const reducedRules = [...reduced.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const stopped = new Set(
      reducedRules.filter((rule) => /animation:\s*none;/.test(rule[2] as string)).flatMap((rule) => splitSelectorList(rule[1] as string)),
    );
    const immediate = new Set(
      reducedRules
        .filter((rule) => /animation-duration:\s*1ms;\s*animation-delay:\s*0s;/.test(rule[2] as string))
        .flatMap((rule) => splitSelectorList(rule[1] as string)),
    );
    const outside = cssCode.replace(reduced, "");
    const animated = [...outside.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)].filter((rule) =>
      /(^|[;\s])animation(-delay)?\s*:(?!\s*none;)/.test(rule[2] as string),
    );
    expect(animated.length).toBeGreaterThan(0);
    for (const rule of animated) {
      for (const selector of splitSelectorList(rule[1] as string)) {
        const settle = selector.startsWith('.openingStage[data-opening="opening"]') && !selector.includes(" ");
        expect(settle ? immediate.has(selector) : stopped.has(selector), selector).toBe(true);
      }
    }
  });

  // RF-06D (P13, docs/TYPOGRAPHY_AND_MOTION.md): every transition outside the
  // reduced-motion block is switched off, selector by selector, inside it.
  it("every RF-06D transition is removed under prefers-reduced-motion: reduce", () => {
    const reduceQuery = "(prefers-reduced-motion: reduce)";
    const reduced = mediaBlock(cssCode, reduceQuery);
    expect(reduced).not.toBeNull();
    expect(cssCode.split(`@media ${reduceQuery}`)).toHaveLength(2);
    const reducedRules = [...(reduced as string).matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const neutralized = new Set(
      reducedRules
        .filter((rule) => /transition:\s*none;/.test(rule[2] as string))
        .flatMap((rule) => splitSelectorList(rule[1] as string)),
    );
    const outside = cssCode.replace(reduced as string, "");
    const moving = [...outside.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)].filter((rule) =>
      /(^|[;\s])transition(-\w+)?\s*:(?!\s*none;)/.test(rule[2] as string),
    );
    expect(moving.length).toBeGreaterThan(0);
    for (const rule of moving) {
      for (const selector of splitSelectorList(rule[1] as string)) {
        expect(neutralized.has(selector), selector).toBe(true);
      }
    }
  });

  it("every rule's selector list starts from a module class", () => {
    // Keyframe blocks hold percentage/from/to steps, not selectors.
    const withoutKeyframes = cssCode.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, "");
    const selectors = [...withoutKeyframes.matchAll(/(^|[{}])\s*([^{}@;]+)\{/g)].map((match) => (match[2] as string).trim());
    expect(selectors.length).toBeGreaterThan(20);
    for (const list of selectors) {
      for (const selector of splitSelectorList(list)) {
        expect(selector, selector).toMatch(/^\.[a-zA-Z]/);
      }
    }
  });
});

describe("RF-06B decor and provenance (P4–P6)", () => {
  // Design Baseline A1 decor set (docs/DECISIONS.md, B9 step 4): SVG and
  // WebP files recorded in PROVENANCE.md, referenced by the renderer by exact
  // literal path only (rules at the end of this block).
  const DECOR_DIR = "public/renderers/wedding/elegant-editorial/v1";
  const DECOR_SVG_FILES = [
    "calendar-heart.svg",
    "opening-cover-card-frame.svg",
    "opening-envelope-body.svg",
    "opening-envelope-flap.svg",
    "opening-envelope-liner.svg",
    "opening-seal-double-happiness.svg",
    "ornament-fleuron.svg",
    "ornament-sparkle.svg",
  ] as const;
  /** P6: raster pixels at no more than 2x the largest Task029 rendered CSS size. */
  const DECOR_RASTER_MAX_PIXELS: ReadonlyMap<string, readonly [number, number]> = new Map([
    ["calendar-botanical-bottom-right.webp", [256, 256]],
    ["calendar-botanical-top-left.webp", [256, 256]],
    ["couple-floral-divider.webp", [600, 200]],
    // Micro-Checkpoint 1B: size-optimized copies of the approved Task029 envelope PNGs.
    ["opening-envelope-body.webp", [600, 400]],
    ["opening-envelope-flap.webp", [570, 380]],
    ["opening-envelope-seal.webp", [132, 132]],
    // Micro-Checkpoint 4: size-optimized copies of the approved Task029 bouquets and floral strip.
    ["calendar-flower-top-left.webp", [256, 256]],
    ["calendar-flower-bottom-right.webp", [256, 256]],
    ["portrait-divider-floral-strip.webp", [600, 200]],
  ]);
  /** The only decor files derived from Task029 prototype pixels (Product Owner decision, 2026-10-01). */
  const TASK029_DERIVED_FILES = [
    "opening-envelope-body.webp",
    "opening-envelope-flap.webp",
    "opening-envelope-seal.webp",
    "calendar-flower-top-left.webp",
    "calendar-flower-bottom-right.webp",
    "portrait-divider-floral-strip.webp",
  ] as const;
  const decorFiles = (): string[] => readdirSync(join(REPO_ROOT, DECOR_DIR)).sort();
  const readDecorBytes = (file: string): Buffer => readFileSync(join(REPO_ROOT, DECOR_DIR, file));

  /** RIFF chunk ids plus the VP8X flags and canvas size of a WebP file. */
  function webpChunks(bytes: Buffer): { ids: string[]; flags: number; width: number; height: number } {
    expect(bytes.toString("latin1", 0, 4)).toBe("RIFF");
    expect(bytes.toString("latin1", 8, 12)).toBe("WEBP");
    const ids: string[] = [];
    let flags = 0;
    let width = 0;
    let height = 0;
    for (let offset = 12; offset + 8 <= bytes.length; ) {
      const id = bytes.toString("latin1", offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      ids.push(id);
      if (id === "VP8X") {
        flags = bytes.readUInt8(offset + 8);
        width = bytes.readUIntLE(offset + 12, 3) + 1;
        height = bytes.readUIntLE(offset + 15, 3) + 1;
      }
      offset += 8 + size + (size % 2);
    }
    return { ids, flags, width, height };
  }

  it("the production asset path holds exactly the recorded decor set", () => {
    expect(readdirSync(join(REPO_ROOT, "public", "renderers"))).toEqual(["wedding"]);
    // VH-02A: the Vietnamese Heritage v1 sibling directory is verified in the VH section below.
    expect(readdirSync(join(REPO_ROOT, "public", "renderers", "wedding"))).toEqual(["elegant-editorial", "vietnamese-heritage"]);
    expect(readdirSync(join(REPO_ROOT, "public", "renderers", "wedding", "elegant-editorial"))).toEqual(["v1"]);
    expect(decorFiles()).toEqual([...DECOR_SVG_FILES, ...DECOR_RASTER_MAX_PIXELS.keys()].sort());
  });

  it("every file on disk in the decor directory has a provenance row and no prototype-pixel derivation", () => {
    const note = readRepoFile(RF06B_PROVENANCE_FILE);
    expect(note.match(/Derived from Task 029 prototype pixels:\*\* \*\*NO\.\*\*/g)).toHaveLength(2);
    // Exactly two YES records (envelope; bouquets + strip), together listing exactly the Task029-derived rasters.
    expect(note.match(/Derived from Task 029 prototype pixels:\*\* \*\*YES\.\*\*/g)).toHaveLength(2);
    const derivedSection = note.slice(note.indexOf("## Approved Task029 opening envelope rasters"));
    expect([...derivedSection.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1])).toStrictEqual([...TASK029_DERIVED_FILES]);
    for (const file of decorFiles()) {
      expect(note, file).toMatch(new RegExp(`^\\| \`${file.replace(/[.]/g, "\\.")}\` \\|`, "m"));
    }
  });

  it("decor SVGs are static and self-contained", () => {
    for (const file of DECOR_SVG_FILES) {
      const svg = readRepoFile(`${DECOR_DIR}/${file}`);
      expect(svg.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\""), file).toBe(true);
      for (const forbidden of [
        /<script/i,
        /<foreignObject/i,
        /<image/i,
        /<style/i,
        /@import|@font-face/i,
        /\son[a-z]+\s*=/i,
        /(xlink:)?href\s*=/i,
        /data:/i,
        /url\((?!#)/i,
        /https?:\/\/(?!www\.w3\.org\/2000\/svg")/i,
        /prototypes/i,
      ]) {
        expect(forbidden.test(svg), `${file}: ${String(forbidden)}`).toBe(false);
      }
    }
  });

  it("decor rasters are WebP with alpha, no metadata chunks, within the P6 2x size", () => {
    for (const [file, [maxWidth, maxHeight]] of DECOR_RASTER_MAX_PIXELS) {
      const { ids, flags, width, height } = webpChunks(readDecorBytes(file));
      expect(ids[0], file).toBe("VP8X");
      expect(flags & 0x10, `${file}: alpha flag`).toBe(0x10);
      expect(flags & (0x20 | 0x08 | 0x04 | 0x02), `${file}: ICC/EXIF/XMP/animation flags`).toBe(0);
      expect(ids.filter((id) => !["VP8X", "ALPH", "VP8 ", "VP8L"].includes(id)), file).toEqual([]);
      expect(width, file).toBeLessThanOrEqual(maxWidth);
      expect(height, file).toBeLessThanOrEqual(maxHeight);
    }
  });

  it("the decor payload stays inside the P6 budget (about 1 MB total)", () => {
    const total = decorFiles().reduce((sum, file) => sum + readDecorBytes(file).length, 0);
    expect(total).toBeLessThan(1_000_000);
  });

  it("the provenance note lives in the v1 template directory and records source, owner and rights basis", () => {
    const note = readRepoFile(RF06B_PROVENANCE_FILE);
    for (const required of ["Source:", "Author / owner:", "External sources:", "Rights basis:", "Task 029", "RF-06B"]) {
      expect(note, required).toContain(required);
    }
  });

  // RF-06B cross-checkpoint compatibility correction (Design Baseline A1): the
  // renderer now references the frozen decor set, file-backed, by exact literal
  // path only. This replaces the former "decor is inline vector geometry only"
  // rule; the CSS-module url( ban above stays in force.
  const DECOR_PUBLIC_PATH = `/${DECOR_DIR.replace(/^public\//, "")}/`;
  // Micro-Checkpoint 1B: the approved Task029 body/flap/seal rasters replace the
  // former SVG envelope layers, which stay on disk unreferenced (legacy).
  const OPENING_DECOR_FILES = [
    "opening-cover-card-frame.svg",
    "opening-envelope-body.webp",
    "opening-envelope-flap.webp",
    "opening-envelope-seal.webp",
  ] as const;
  /** Exactly the renderer modules allowed an `<img>`: runtime media, or one fixed decor file each. */
  const IMG_ELEMENT_MODULES = [
    `${V1}/sections/media-image.tsx`,
    `${V1}/sections/couple.tsx`,
    `${V1}/sections/families.tsx`,
    `${V1}/sections/calendar.tsx`,
    `${V1}/sections/events.tsx`,
    `${V1}/sections/closing.tsx`,
  ] as const;
  const DECOR_MODULE = `${V1}/sections/decor.tsx`;

  it("decor.tsx uses the opening files only as exact literal SVG <image> sources, nothing else file-backed", () => {
    expect(codeOf(DECOR_MODULE)).not.toMatch(/opening-envelope-(body|flap|liner)\.svg|opening-seal-double-happiness/);
    const code = codeOf(DECOR_MODULE);
    expect(code).not.toMatch(/<img\b|data:|url\(|base64|xlink:|<use\b|<foreignObject|dangerouslySetInnerHTML|https?:/);
    const hrefs = [...code.matchAll(/<image\b[^>]*>/g)].map((match) => /\shref="([^"]*)"/.exec(match[0])?.[1]);
    expect([...hrefs].sort()).toStrictEqual(OPENING_DECOR_FILES.map((file) => `${DECOR_PUBLIC_PATH}${file}`).sort());
    // Every href is one of those literal attributes: no computed href={…}.
    expect(code.match(/\bhref\b/g)).toHaveLength(OPENING_DECOR_FILES.length);
  });

  it("renderer modules reference decor only by exact literal paths to files in the frozen decor set", () => {
    const onDisk = new Set(decorFiles());
    for (const file of RF06B_RENDERER_FILES) {
      const code = codeOf(file);
      // No path construction around the decor directory (template or concatenation).
      expect(code, file).not.toMatch(/renderers\/[^"'`\n]*\$\{|`[^`]*\/renderers\/|\/renderers\/[^"'`\n]*["'`]\s*\+/);
      for (const match of code.matchAll(/["'`]([^"'`\n]*\/renderers\/[^"'`\n]*)["'`]/g)) {
        const literal = match[1] as string;
        expect(literal, file).toMatch(/^\/renderers\/wedding\/elegant-editorial\/v1\/[a-z0-9-]+\.(svg|webp)$/);
        const name = literal.slice(DECOR_PUBLIC_PATH.length);
        expect(onDisk.has(name), `${file}: ${literal}`).toBe(true);
        // The opening artwork is owned by the static EnvelopeMotif only.
        if ((OPENING_DECOR_FILES as readonly string[]).includes(name)) expect(file).toBe(DECOR_MODULE);
      }
    }
  });

  it("<img> only in the exact media/decor modules, <image> only in decor.tsx, no next/image, no other public or remote source", () => {
    for (const file of RF06B_RENDERER_FILES) {
      const code = codeOf(file);
      expect(/<img\b/.test(code), file).toBe((IMG_ELEMENT_MODULES as readonly string[]).includes(file));
      expect(/<image\b/.test(code), file).toBe(file === DECOR_MODULE);
      expect(code, file).not.toMatch(/next\/image|https?:\/\/|data:/);
      // A literal src/href attribute may only point into the frozen decor directory.
      for (const match of code.matchAll(/\s(?:src|href)="([^"]*)"/g)) {
        expect(match[1], file).toMatch(/^\/renderers\/wedding\/elegant-editorial\/v1\//);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Internal renderer harness (P23, P25, P38, P39)
// ---------------------------------------------------------------------------

const HARNESS_ROOT = "app/internal/renderer-harness";
const HARNESS_GATE = `${HARNESS_ROOT}/layout.tsx`;
const HARNESS_PAGE = `${HARNESS_ROOT}/page.tsx`;
const HARNESS_WRAPPER = `${HARNESS_ROOT}/renderer-harness-client.tsx`;
/** P30 amendment (Staff Preview RSVP): the staff preview frame's UNAVAILABLE-only wrapper. */
const STAFF_PREVIEW_WRAPPER = "app/admin/preview-frame/staff-preview-renderer.tsx";
/** Task 033A: the public /i/[slug] wrapper, the only caller with a REAL RSVP capability. */
const PUBLIC_INVITATION_WRAPPER = "app/i/[slug]/public-invitation-renderer.tsx";
const HARNESS_SCENARIOS = `${HARNESS_ROOT}/harness-scenarios.ts`;
const HARNESS_FILES = [HARNESS_GATE, HARNESS_PAGE, HARNESS_WRAPPER, HARNESS_SCENARIOS] as const;
/** RF-06D: provenance note for the harness-only audio tone (not code). */
const HARNESS_AUDIO_PROVENANCE = `${HARNESS_ROOT}/harness-audio-provenance.md`;

const HARNESS_ALLOWED_IMPORTS: Readonly<Record<(typeof HARNESS_FILES)[number], readonly string[]>> = {
  [HARNESS_GATE]: ["next", "next/navigation"],
  [HARNESS_PAGE]: ["next/link", "next/navigation", `${HARNESS_ROOT}/harness-scenarios`, `${HARNESS_ROOT}/renderer-harness-client`],
  // RF-06C: the wrapper renders the host core so it can pass its RSVP capability client-to-client (P25, P30).
  [HARNESS_WRAPPER]: [
    `${LIB}/invitation-view-model-types`,
    `${LIB}/renderer-selection`,
    `${LIB}/rsvp-capability`,
    "templates/core/client/invitation-renderer-host-core",
  ],
  [HARNESS_SCENARIOS]: [
    `${LIB}/invitation-view-model-types`,
    `${LIB}/renderer-selection`,
    `${LIB}/snapshot-payload-types`,
    "templates/core/fixtures/renderer-fixture-pipeline",
    "templates/core/fixtures/renderer-fixture-sources",
  ],
};

describe("internal renderer harness boundary", () => {
  it("the harness tree is exactly the gate, page, wrapper and scenario module (plus the RF-06D audio provenance note)", () => {
    expect(listSources(join(REPO_ROOT, HARNESS_ROOT)).sort()).toStrictEqual(
      [...HARNESS_FILES, HARNESS_AUDIO_PROVENANCE].sort(),
    );
  });

  it.each(HARNESS_FILES)("%s imports only its exact allowlist", (file) => {
    const resolved = importsOf(readRepoFile(file)).map((statement) => resolveSpecifier(file, statement.specifier));
    expect([...resolved].sort(), file).toStrictEqual([...HARNESS_ALLOWED_IMPORTS[file]].sort());
  });

  it("only the server gate reads process.env, exactly once, and only NODE_ENV to return notFound() in production", () => {
    for (const file of HARNESS_FILES) {
      const code = codeOf(file);
      const reads = code.match(/process\.env(\.\w+|\[)?/g) ?? [];
      if (file === HARNESS_GATE) {
        expect(reads).toStrictEqual(["process.env.NODE_ENV"]);
        expect(code).toMatch(/if \(process\.env\.NODE_ENV === "production"\) \{\s*notFound\(\);\s*\}/);
        expect(code).toMatch(/robots: \{ index: false, follow: false \}/);
        expect(/["']use client["']/.test(readRepoFile(file))).toBe(false);
      } else {
        expect(reads, file).toStrictEqual([]);
      }
    }
  });

  it("the server page imports exactly one client module (the wrapper) and never the host in parallel", () => {
    const pageImports = importsOf(readRepoFile(HARNESS_PAGE)).map((statement) =>
      resolveSpecifier(HARNESS_PAGE, statement.specifier),
    );
    const clientImports = pageImports.filter((modulePath) => {
      const local = [`${modulePath}.tsx`, `${modulePath}.ts`].find((candidate) => {
        try {
          readRepoFile(candidate);
          return true;
        } catch {
          return false;
        }
      });
      return local !== undefined && /^["']use client["']/.test(readRepoFile(local));
    });
    expect(clientImports).toStrictEqual([`${HARNESS_ROOT}/renderer-harness-client`]);
    expect(pageImports).not.toContain("templates/core/invitation-renderer-host");
    for (const modulePath of pageImports) expect(modulePath).not.toMatch(/templates\/core\/client|capabilit/);
    expect(/["']use client["']/.test(readRepoFile(HARNESS_PAGE))).toBe(false);
    expect(/["']use client["']/.test(readRepoFile(HARNESS_SCENARIOS))).toBe(false);
    expect(readRepoFile(HARNESS_WRAPPER).startsWith('"use client";\n')).toBe(true);
  });

  // RF-06C replacement of the RF-06B "no capability" assertion (P25, P30, P33).
  it("the wrapper constructs only the harness RSVP UNAVAILABLE capability and passes only it to the host core", () => {
    const code = codeOf(HARNESS_WRAPPER);
    expect(code).toMatch(/const HARNESS_RSVP_UNAVAILABLE_RESULT: RsvpSubmitResultV1 = Object\.freeze\(\{ status: "UNAVAILABLE" \}\);/);
    expect(code).toMatch(/const HARNESS_RSVP_UNAVAILABLE: RsvpCapabilityV1 = Object\.freeze\(\{/);
    expect(code.match(/status: "\w+"/g)).toStrictEqual(['status: "UNAVAILABLE"']);
    expect(code).not.toMatch(/SUCCESS|INVALID|FAILED/);
    expect(code).not.toMatch(/clipboard|music|clock|capabilities|capabilityOverrides|useState|useEffect/i);
    expect(code).toMatch(
      /<InvitationRendererHostCore\s+rendererKey=\{rendererKey\}\s+viewModel=\{viewModel\}\s+sections=\{sections\}\s+rsvp=\{HARNESS_RSVP_UNAVAILABLE\}\s+\/>/,
    );
  });

  it("the server page and scenario module construct and import no capability or callback", () => {
    for (const file of [HARNESS_PAGE, HARNESS_SCENARIOS, HARNESS_GATE]) {
      // `music: false` is a serializable section setting in the scenario data, not a capability.
      expect(codeOf(file), file).not.toMatch(/rsvp|capabilit|submit|clipboard|clock|\.play\(|\.pause\(/i);
    }
  });

  it("the query string only selects a scenario; it is never guest identity", () => {
    const code = codeOf(HARNESS_PAGE);
    expect(code).toMatch(/const \{ scenario \} = await searchParams;/);
    expect(code.match(/searchParams/g)).toHaveLength(3);
    expect(code).not.toMatch(/guest/i);
    for (const file of HARNESS_FILES) {
      expect(codeOf(file), file).not.toMatch(/[?&]guest=|searchParams\.get|token/i);
    }
  });

  it.each(HARNESS_FILES)("%s uses no Supabase, database, network, server secrets or prototypes", (file) => {
    const code = codeOf(file);
    for (const pattern of [
      /supabase/i,
      /service_role/,
      /lib\/server/,
      /\bfetch\s*\(/,
      /["']node:/,
      /app\/internal\/prototypes|public\/prototypes|_directions/,
      /public\/renderers|\/renderers\//,
      /Date\.now|\bnew Date\b|Math\.random/,
    ]) {
      expect(pattern.test(code), `${file}: ${String(pattern)}`).toBe(false);
    }
  });

  it("no templates/** or lib/** module imports the harness", () => {
    const scan = (dir: string): string[] =>
      readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? scan(`${dir}/${entry.name}`) : /\.(ts|tsx)$/.test(entry.name) ? [`${dir}/${entry.name}`] : [],
      );
    for (const file of [...scan("templates"), ...scan("lib")]) {
      if (file.includes("__tests__")) continue;
      expect(/renderer-harness/.test(codeOf(file)), file).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Client import graph (P26, P45): everything reachable from the host
// ---------------------------------------------------------------------------

function resolveModuleFile(modulePath: string): string | undefined {
  for (const candidate of [modulePath, `${modulePath}.ts`, `${modulePath}.tsx`, `${modulePath}/index.ts`]) {
    try {
      if (readdirSync(join(REPO_ROOT, candidate, ".."), { withFileTypes: true }).some(
        (entry) => entry.isFile() && entry.name === candidate.split("/").pop(),
      )) {
        return candidate;
      }
    } catch {
      // Not a directory entry; try the next candidate.
    }
  }
  return undefined;
}

/** Transitive value-import closure (type-only imports are erased and not followed). */
function clientGraph(entry: string): { files: string[]; external: string[] } {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (files.has(file)) continue;
    files.add(file);
    if (!/\.(ts|tsx)$/.test(file)) continue;
    for (const statement of importsOf(readRepoFile(file))) {
      if (statement.typeOnly) continue;
      if (!statement.specifier.startsWith(".")) {
        external.add(statement.specifier);
        continue;
      }
      const resolved = resolveModuleFile(resolveSpecifier(file, statement.specifier));
      expect(resolved, `${file} → ${statement.specifier}`).toBeDefined();
      queue.push(resolved as string);
    }
  }
  return { files: [...files].sort(), external: [...external].sort() };
}

describe("client import graph from the host (P26, P45)", () => {
  const graph = clientGraph(HOST_MODULE);

  // RF-06C: the capability hooks bring `react` into the value graph, so the
  // description (which previously named react while asserting only
  // next/font/google) is now exact.
  it("reaches only react, next/font/google and repository modules", () => {
    expect(graph.external).toStrictEqual(["next/font/google", "react"]);
  });

  it("reaches exactly the RF-06C client-runtime modules, and adapters only through them", () => {
    expect(graph.files.filter((file) => file.startsWith("templates/core/client/"))).toStrictEqual([...RF06C_FILES].sort());
  });

  /** P37/P45: pure modules under a server path, recorded debt; nothing else under lib/server may be reached. */
  const RF05C_TIMESTAMP_VALIDATOR = "lib/server/validation/timestamptz.ts";

  it("the only lib/server modules reached are the two recorded pure validators (P37, P45)", () => {
    expect(graph.files.filter((file) => file.startsWith("lib/server"))).toStrictEqual(
      [RF05C_TIMESTAMP_VALIDATOR, TASK028_VALIDATOR].sort(),
    );
    expect(importsOf(readRepoFile(RF05C_TIMESTAMP_VALIDATOR))).toStrictEqual([]);
  });

  // RF-06D replacement: the RSVP island needs the frozen RF-05A RSVP limits
  // and canonical validator, so `rsvp-capability` (pure, framework-free) is
  // now reached — and only through the two RF-06D RSVP modules.
  it("reaches no fixtures, harness or prototypes; the RF-05A RSVP contract only through the RF-06D RSVP modules", () => {
    for (const file of graph.files) {
      expect(file).not.toMatch(/fixtures|renderer-harness|prototypes|_directions/);
    }
    const RSVP_CONTRACT = `${LIB}/rsvp-capability`;
    expect(graph.files).toContain(`${RSVP_CONTRACT}.ts`);
    const valueImporters = graph.files.filter(
      (file) =>
        /\.(ts|tsx)$/.test(file) &&
        importsOf(readRepoFile(file)).some(
          (statement) => !statement.typeOnly && resolveSpecifier(file, statement.specifier) === RSVP_CONTRACT,
        ),
    );
    // VH-02B-E1: plus the shared renderer RSVP form model (Vietnamese Heritage imports the contract type-only).
    expect(valueImporters.sort()).toStrictEqual([RF06D_RSVP, RF06D_RSVP_MODEL, VH02B_SHARED_RSVP_MODEL].sort());
  });

  it.each(graph.files.filter((file) => /\.(ts|tsx)$/.test(file)))(
    "%s uses no fs, secret, service_role, Supabase or process.env",
    (file) => {
      const code = codeOf(file);
      for (const pattern of [/["']node:|["']fs["']/, /service_role/, /supabase/i, /process\.env/, /SECRET|API_KEY/]) {
        expect(pattern.test(code), `${file}: ${String(pattern)}`).toBe(false);
      }
    },
  );
});

// ===========================================================================
// RF-06C extension (docs/DECISIONS.md "RF-06-0 …" P24, P25, P30, P34–P36,
// P39). Everything above keeps its RF-06A/RF-06B protections; RF-06C adds
// its files here with one least-privilege exception per browser global.
// ===========================================================================

const RF06C_ALLOWED_IMPORTS: Readonly<Record<(typeof RF06C_FILES)[number], readonly string[]>> = {
  [RF06C_CLIPBOARD_MODULE]: [`${LIB}/renderer-capabilities`],
  [RF06C_MUSIC_MODULE]: [`${LIB}/invitation-view-model-types`, `${LIB}/renderer-capabilities`],
  [RF06C_CLOCK_MODULE]: [],
  [RF06C_RUNTIME_MODULE]: [
    "react",
    `${LIB}/invitation-view-model-types`,
    `${LIB}/renderer-capabilities`,
    `${LIB}/renderer-selection`,
    `${LIB}/rsvp-capability`,
    RF06C_CLIPBOARD_MODULE.replace(/\.ts$/, ""),
    RF06C_CLOCK_MODULE.replace(/\.ts$/, ""),
    RF06C_MUSIC_MODULE.replace(/\.ts$/, ""),
  ],
  [RF06C_HOST_CORE_MODULE]: [
    `${LIB}/invitation-view-model-types`,
    `${LIB}/renderer-binding-registry`,
    `${LIB}/renderer-selection`,
    `${LIB}/rsvp-capability`,
    "templates/core/production-renderer-bindings",
    RF06C_RUNTIME_MODULE.replace(/\.ts$/, ""),
  ],
};

/** Forbidden in every RF-06C file (comments stripped). */
const RF06C_FORBIDDEN: readonly [string, RegExp][] = [
  ["prototype", /app\/internal\/prototypes|public\/prototypes|_directions|GreenIvoryEditorialPrototype/],
  ["Supabase", /supabase/i],
  ["service_role", /service_role/],
  ["lib/server import", /lib\/server|\.\.\/server\//],
  ["DB client", /createClient|\bpg\b|postgres/i],
  ["process.env", /process\.env/],
  ["secret", /SECRET|API_KEY/],
  ["network", /\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|EventSource/],
  ["persistence", /localStorage|sessionStorage|indexedDB|\bcookie|caches\./i],
  ["window", /\bwindow\b/],
  ["document", /\bdocument\b/],
  ["execCommand", /execCommand/],
  ["Date construction/parsing", /\bnew Date\b|\bDate\(|Date\.parse|Date\.UTC/],
  ["Intl / locale formatting", /\bIntl\b|toLocale/],
  ["Date getters", /get(UTC)?(Day|Date|Month|FullYear|Hours)\b/],
  ["performance.now", /performance\.now/],
  ["randomness", /Math\.random|randomUUID|getRandomValues/],
  ["other timers", /setTimeout|requestAnimationFrame|requestIdleCallback/],
  ["observers / media queries (RF-06D)", /IntersectionObserver|matchMedia/],
  ["dynamic import / require / import.meta", /\bimport\s*\(|\brequire\s*\(|import\.meta/],
  ["filesystem", /["']node:|["']fs["']|readdir|readFile/],
  ["use server", /["']use server["']/],
  ["external font URL", /fonts\.(googleapis|gstatic)\.com/],
  ["next import", /from\s+["']next(\/[^"']*)?["']/],
  ["renderer component import", /elegant-editorial/],
  ["harness import", /renderer-harness/],
  ["interaction UI (RF-06D)", /\bonClick\b|\bonSubmit\b|\bonChange\b|<button|<form|<input|<select|<textarea|<dialog|role="dialog"|<audio/],
  ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/],
  ["framer-motion", /framer-motion|\bmotion\./],
  ["autoplay / volume / mute / seek", /autoplay|\.volume|\.muted|currentTime|fastSeek|playbackRate/i],
  ["RSVP construction", /\bsubmit\s*[:(]|RSVP_SUBMIT|isValidRsvpSubmitInputV1/],
  ["generic capability bag / overrides", /capabilityOverrides|harnessCapabilities|Record<string,\s*unknown>/],
];

/**
 * One least-privilege owner per browser primitive (P39): each browser
 * pattern is allowed in exactly the listed RF-06C module(s), and nowhere in
 * RF-06A/RF-06B code either. Wiring patterns are checked within RF-06C only.
 */
const RF06C_BROWSER_PRIVILEGE: readonly [string, RegExp, readonly string[]][] = [
  ["navigator", /\bnavigator\b/, [RF06C_CLIPBOARD_MODULE]],
  ["Audio", /\bAudio\b|HTMLAudioElement/, [RF06C_MUSIC_MODULE]],
  ["Date.now", /Date\.now/, [RF06C_CLOCK_MODULE]],
  ["setInterval / clearInterval", /\b(set|clear)Interval\b/, [RF06C_CLOCK_MODULE]],
  [
    "React hooks",
    /\buse(State|Effect|LayoutEffect|InsertionEffect|Ref|Memo|Callback|Reducer|SyncExternalStore|Context|Transition|Optimistic|ActionState)\b/,
    [RF06C_RUNTIME_MODULE],
  ],
];

const RF06C_WIRING_PRIVILEGE: readonly [string, RegExp, readonly string[]][] = [
  ["react import", /from\s+["']react["']/, [RF06C_RUNTIME_MODULE]],
  ["component resolution", /resolveInvitationRendererComponent|PRODUCTION_RENDERER_BINDING_REGISTRY/, [RF06C_HOST_CORE_MODULE]],
  ["capability composition", /composeRendererCapabilities|useInvitationRendererCapabilities/, [RF06C_RUNTIME_MODULE, RF06C_HOST_CORE_MODULE]],
  ["SUCCESS literal", /["']SUCCESS["']/, [RF06C_CLIPBOARD_MODULE]],
];

function nonTestSources(dir: string): string[] {
  return readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "node_modules" ? [] : nonTestSources(`${dir}/${entry.name}`);
    return /\.(ts|tsx)$/.test(entry.name) ? [`${dir}/${entry.name}`] : [];
  });
}

function resolvedImportsOf(file: string): string[] {
  return importsOf(readRepoFile(file)).map((statement) => resolveSpecifier(file, statement.specifier));
}

describe("RF-06C client-runtime files", () => {
  it("every listed file exists and is neither a client nor a server boundary", () => {
    for (const file of RF06C_FILES) {
      const code = codeOf(file);
      expect(/["']use client["']/.test(code), file).toBe(false);
      expect(/["']use server["']/.test(code), file).toBe(false);
    }
  });

  it.each(RF06C_FILES)("%s imports only its exact allowlist", (file) => {
    expect([...resolvedImportsOf(file)].sort(), file).toStrictEqual([...RF06C_ALLOWED_IMPORTS[file]].sort());
  });

  it.each(RF06C_FILES)("%s contains no forbidden data, network, persistence, date, UI or RSVP code", (file) => {
    const code = codeOf(file);
    for (const [label, pattern] of RF06C_FORBIDDEN) {
      expect(pattern.test(code), `${file}: ${label}`).toBe(false);
    }
  });

  it.each(RF06C_BROWSER_PRIVILEGE)("browser: %s appears only in its owning RF-06C module", (_label, pattern, owners) => {
    for (const file of RF06C_FILES) {
      expect(pattern.test(codeOf(file)), file).toBe(owners.includes(file));
    }
    for (const file of [...RF06A_FILES, ...RF06B_CODE_FILES]) {
      expect(pattern.test(codeOf(file)), file).toBe(false);
    }
  });

  it.each(RF06C_WIRING_PRIVILEGE)("wiring: %s appears only in its owning RF-06C module", (_label, pattern, owners) => {
    for (const file of RF06C_FILES) {
      expect(pattern.test(codeOf(file)), file).toBe(owners.includes(file));
    }
  });

  it("browser primitives are referenced only inside functions, never evaluated at module load", () => {
    expect(codeOf(RF06C_MUSIC_MODULE)).toMatch(/export const createBrowserAudio: MusicAudioFactoryV1 = \(\) => new Audio\(\);/);
    expect(codeOf(RF06C_MUSIC_MODULE).match(/\bAudio\b/g)).toHaveLength(1);
    expect(codeOf(RF06C_CLOCK_MODULE)).toMatch(/now: \(\) => Date\.now\(\),/);
    expect(codeOf(RF06C_CLOCK_MODULE).match(/Date\.now/g)).toHaveLength(1);
    expect(codeOf(RF06C_CLOCK_MODULE).match(/\bsetInterval\(callback, delayMs\)/g)).toHaveLength(1);
    expect(codeOf(RF06C_CLIPBOARD_MODULE).match(/\bnavigator\b/g)).toStrictEqual(["navigator", "navigator"]);
    expect(codeOf(RF06C_CLIPBOARD_MODULE)).toMatch(/if \(typeof navigator === "undefined"\) return undefined;/);
  });

  it("the closed capability object is built by explicit per-key selection only", () => {
    const code = codeOf(RF06C_RUNTIME_MODULE);
    for (const key of ["rsvp", "clipboard", "music", "clock"]) {
      expect(code).toContain(`if (parts.${key} !== undefined) capabilities.${key} = parts.${key};`);
    }
    expect(code).not.toMatch(/\.\.\.|Object\.assign|Object\.entries|Object\.keys|Object\.fromEntries/);
  });

  it("the host core accepts exactly the three serializable props plus the client-to-client rsvp", () => {
    const code = codeOf(RF06C_HOST_CORE_MODULE);
    const props = /interface InvitationRendererHostCoreProps \{([\s\S]*?)\}/.exec(code)?.[1] ?? "";
    expect([...props.matchAll(/readonly (\w+)\??:/g)].map((match) => match[1])).toStrictEqual([
      "rendererKey",
      "viewModel",
      "sections",
      "rsvp",
    ]);
    expect(code).toMatch(/readonly rsvp\?: RsvpCapabilityV1;/);
    expect(code).toMatch(/<Renderer viewModel=\{viewModel\} sections=\{sections\} capabilities=\{capabilities\} \/>/);
    expect(code).not.toMatch(/\btry\b|\bcatch\b|ErrorBoundary|fallback/);
  });
});

describe("RF-06C boundaries across the repository", () => {
  const appSources = nonTestSources("app");
  const productionSources = [...nonTestSources("templates"), ...nonTestSources("lib"), ...appSources];

  it("only the production host, the harness wrapper, the staff preview wrapper and the Task 033A public wrapper render the host core", () => {
    const importers = productionSources.filter((file) =>
      resolvedImportsOf(file).includes(RF06C_HOST_CORE_MODULE.replace(/\.tsx$/, "")),
    );
    expect(importers.sort()).toStrictEqual([HARNESS_WRAPPER, HOST_MODULE, PUBLIC_INVITATION_WRAPPER, STAFF_PREVIEW_WRAPPER].sort());
    for (const importer of importers) expect(readRepoFile(importer).startsWith('"use client";\n'), importer).toBe(true);
  });

  it("only the host core imports the runtime composition, and only the runtime composition imports adapters", () => {
    const importersOf = (module: string) =>
      productionSources.filter((file) => resolvedImportsOf(file).includes(module.replace(/\.tsx?$/, "")));
    expect(importersOf(RF06C_RUNTIME_MODULE)).toStrictEqual([RF06C_HOST_CORE_MODULE]);
    for (const adapter of [RF06C_CLIPBOARD_MODULE, RF06C_MUSIC_MODULE, RF06C_CLOCK_MODULE]) {
      expect(importersOf(adapter), adapter).toStrictEqual([RF06C_RUNTIME_MODULE]);
    }
  });

  it("no Server Component under app/** imports the host core, runtime capabilities or an adapter", () => {
    for (const file of appSources) {
      if (/^["']use client["']/.test(readRepoFile(file))) continue;
      for (const modulePath of resolvedImportsOf(file)) {
        expect(modulePath, file).not.toMatch(/templates\/core\/client\//);
      }
    }
  });

  it("an RSVP capability is constructed only in the harness, staff preview and Task 033A public wrappers; preview ones only as UNAVAILABLE", () => {
    for (const file of productionSources) {
      const constructs = /:\s*RsvpCapabilityV1\s*=/.test(codeOf(file));
      expect(constructs, file).toBe(file === HARNESS_WRAPPER || file === STAFF_PREVIEW_WRAPPER || file === PUBLIC_INVITATION_WRAPPER);
    }
    const staffPreview = codeOf(STAFF_PREVIEW_WRAPPER);
    expect(staffPreview).toMatch(/Object\.freeze\(\{ status: "UNAVAILABLE" \}\)/);
    expect(staffPreview).not.toMatch(/"SUCCESS"|fetch\(|supabase|"rsvps"|method:/i);
  });

  it("no server-safe registry, manifest or fixture module reaches an RF-06C module", () => {
    for (const file of [...RF06A_FILES, BINDINGS_MODULE]) {
      for (const modulePath of resolvedImportsOf(file)) {
        expect(modulePath, file).not.toMatch(/templates\/core\/client\/|invitation-renderer-host/);
      }
    }
  });
});

// ===========================================================================
// RF-06D extension (docs/DECISIONS.md "RF-06-0 …" P7, P13, P30–P35, P39).
// Everything above keeps its RF-06A/B/C protections. RF-06D relaxes the
// RF-06B "static only" rules for exactly the named island modules, one
// least-privilege owner per interaction primitive; RF-06B files stay static
// and the RF-06C browser adapters stay the only browser-global owners.
// ===========================================================================

const RF06D_ALLOWED_IMPORTS: Readonly<Record<(typeof RF06D_FILES)[number], readonly string[]>> = {
  [RF06D_OPENING]: [
    "react",
    `${LIB}/invitation-view-model-types`,
    `${V1}/copy`,
    CSS_MODULE,
    `${V1}/sections/decor`,
    // The rising card shows only the RESOLVED media.cover, through the shared media element.
    `${V1}/sections/media-image`,
    RF06D_OPENING_STATE.replace(/\.ts$/, ""),
  ],
  [RF06D_COUNTDOWN]: [
    `${LIB}/ceremony-countdown`,
    `${LIB}/invitation-view-model-types`,
    `${LIB}/renderer-capabilities`,
    `${V1}/copy`,
    CSS_MODULE,
  ],
  [RF06D_MUSIC]: ["react", `${LIB}/renderer-capabilities`, `${V1}/copy`, CSS_MODULE],
  [RF06D_GIFT_DIALOG]: ["react", `${LIB}/wedding-domain-types`, `${V1}/copy`, CSS_MODULE],
  [RF06D_COPY_BUTTON]: ["react", `${LIB}/renderer-capabilities`, `${V1}/copy`, CSS_MODULE],
  [RF06D_RSVP]: [
    "react",
    "lib/domain",
    `${LIB}/rsvp-capability`,
    `${V1}/copy`,
    CSS_MODULE,
    RF06D_RSVP_MODEL.replace(/\.ts$/, ""),
  ],
  [RF06D_REVEAL]: ["react", CSS_MODULE],
  [RF06D_OPENING_STATE]: [],
  [RF06D_RSVP_MODEL]: ["lib/domain", `${LIB}/rsvp-capability`],
};

/** Forbidden in every RF-06D file (comments stripped). */
const RF06D_FORBIDDEN: readonly [string, RegExp][] = [
  ["prototype", /app\/internal\/prototypes|public\/prototypes|_directions|GreenIvoryEditorialPrototype/],
  ["Supabase", /supabase/i],
  ["service_role", /service_role/],
  ["lib/server import", /lib\/server|\.\.\/server\//],
  ["DB client", /createClient|\bpg\b|postgres/i],
  ["process.env", /process\.env/],
  ["secret", /SECRET|API_KEY/],
  ["network", /\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\/api\//],
  ["persistence", /localStorage|sessionStorage|indexedDB|\bcookie|caches\./i],
  ["window", /\bwindow\b/],
  ["document", /\bdocument\b/],
  ["navigator / Clipboard API", /\bnavigator\b|\bclipboard\.write|writeText|execCommand/],
  ["Audio element / API", /\bAudio\b|HTMLAudioElement|HTMLMediaElement|<audio|<video|\.src\s*=|preload|\.loop\b|autoplay/i],
  ["current time / Date", /Date\.now|\bnew Date\b|\bDate\(|Date\.parse|Date\.UTC|performance\.now/],
  ["Intl / locale formatting", /\bIntl\b|toLocale/],
  ["Date getters", /get(UTC)?(Day|Date|Month|FullYear|Hours)\b/],
  ["timers", /\b(set|clear)(Interval|Timeout)\b|requestAnimationFrame|requestIdleCallback/],
  // IntersectionObserver is privileged to the section reveal only (RF06D_PRIVILEGE below).
  ["observers / media queries", /ResizeObserver|MutationObserver|matchMedia/],
  ["randomness", /Math\.random|randomUUID|getRandomValues/],
  ["dynamic import / require / import.meta", /\bimport\s*\(|\brequire\s*\(|import\.meta/],
  ["filesystem", /["']node:|["']fs["']|readdir|readFile/],
  ["use client / use server", /["']use (client|server)["']/],
  ["next import", /from\s+["']next(\/[^"']*)?["']/],
  ["common QR", /QR_COMMON|commonMediaId|qr\.common/],
  ["additional note", /additional_?note/i],
  ["guest identity / token", /guestId|guest_id|[?&]guest=|token/i],
  ["fabricated success", /status:\s*["']SUCCESS["']/],
  ["framer-motion", /framer-motion|\bmotion\./],
  ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/],
  ["external font URL", /fonts\.(googleapis|gstatic)\.com/],
  ["capability construction / host wiring", /useInvitationRendererCapabilities|composeRendererCapabilities|InvitationRendererHost|templates\/core/],
];

const ALL_HOOKS =
  /\buse(State|Effect|LayoutEffect|InsertionEffect|Ref|Memo|Callback|Reducer|SyncExternalStore|Context|Transition|Optimistic|ActionState|Id|DeferredValue|ImperativeHandle)\b/;

/**
 * P39 least privilege: each interaction primitive is allowed in exactly the
 * listed RF-06D module(s), and in no RF-06A, RF-06B or RF-06C file.
 */
const RF06D_PRIVILEGE: readonly [string, RegExp, readonly string[]][] = [
  ["useState", /\buseState\b/, [RF06D_MUSIC, RF06D_GIFT_DIALOG, RF06D_COPY_BUTTON, RF06D_RSVP]],
  ["useReducer", /\buseReducer\b/, [RF06D_OPENING, RF06D_RSVP]],
  // RF-06D remediation: RSVP manages focus around "Sửa lại" (D11); the reveal observes once after mount.
  ["useRef", /\buseRef\b/, [RF06D_OPENING, RF06D_GIFT_DIALOG, RF06D_RSVP, RF06D_REVEAL]],
  ["useEffect", /\buseEffect\b/, [RF06D_OPENING, RF06D_GIFT_DIALOG, RF06D_RSVP, RF06D_REVEAL]],
  [
    "other hooks",
    /\buse(LayoutEffect|InsertionEffect|Memo|Callback|SyncExternalStore|Context|Transition|Optimistic|ActionState|Id|DeferredValue|ImperativeHandle)\b/,
    [],
  ],
  ["button element", /<button\b/, [RF06D_OPENING, RF06D_MUSIC, RF06D_GIFT_DIALOG, RF06D_COPY_BUTTON, RF06D_RSVP]],
  ["click handler", /\bonClick\b/, [RF06D_OPENING, RF06D_MUSIC, RF06D_GIFT_DIALOG, RF06D_COPY_BUTTON, RF06D_RSVP]],
  ["dialog element / API", /<dialog\b|role="dialog"|showModal|HTMLDialogElement|\.close\(\)|onClose\b|onCancel\b/, [RF06D_GIFT_DIALOG]],
  ["programmatic focus", /\.focus\(/, [RF06D_OPENING, RF06D_GIFT_DIALOG, RF06D_RSVP]],
  ["IntersectionObserver", /IntersectionObserver/, [RF06D_REVEAL]],
  ["reveal marks", /data-ee-reveal/, [RF06D_REVEAL]],
  ["form events", /\bonSubmit\b|\bonChange\b|preventDefault/, [RF06D_RSVP]],
  ["form controls", /<form\b|<input\b|<select\b|<textarea\b|<fieldset\b|<label\b/, [RF06D_RSVP]],
  ["music capability actions", /\.play\(|\.pause\(|MusicCapabilityV1/, [RF06D_MUSIC]],
  ["clipboard capability action", /copyText|ClipboardCapabilityV1/, [RF06D_COPY_BUTTON]],
  ["RSVP capability action", /\.submit\(|RsvpCapabilityV1/, [RF06D_RSVP]],
  ["clock capability consumption", /nowEpochMs|ClockCapabilityV1|deriveCeremonyCountdownV1/, [RF06D_COUNTDOWN]],
  ["tabindex", /\btabIndex\b/, [RF06D_OPENING]],
];

describe("RF-06D interactive files", () => {
  it("every listed file exists; islands are .tsx, models are .ts", () => {
    for (const file of RF06D_ISLAND_FILES) expect(file.endsWith(".tsx"), file).toBe(true);
    for (const file of RF06D_MODEL_FILES) expect(file.endsWith(".ts"), file).toBe(true);
    for (const file of RF06D_FILES) expect(() => readRepoFile(file), file).not.toThrow();
    expect(Object.keys(RF06D_ALLOWED_IMPORTS).sort()).toStrictEqual([...RF06D_FILES].sort());
  });

  it.each(RF06D_FILES)("%s imports only its exact allowlist", (file) => {
    expect([...new Set(resolvedImportsOf(file))].sort(), file).toStrictEqual([...RF06D_ALLOWED_IMPORTS[file]].sort());
  });

  it.each(RF06D_FILES)("%s contains no forbidden data, network, persistence, browser-global, time or identity code", (file) => {
    const code = codeOf(file);
    for (const [label, pattern] of RF06D_FORBIDDEN) {
      expect(pattern.test(code), `${file}: ${label}`).toBe(false);
    }
  });

  it.each(RF06D_PRIVILEGE)("interaction: %s appears only in its owning RF-06D module(s)", (_label, pattern, owners) => {
    for (const file of RF06D_FILES) {
      expect(pattern.test(codeOf(file)), file).toBe(owners.includes(file));
    }
    for (const file of [...RF06A_FILES, ...RF06B_CODE_FILES]) {
      expect(pattern.test(codeOf(file)), file).toBe(false);
    }
  });

  it("the pure models import no React, render nothing and use no hooks", () => {
    for (const file of RF06D_MODEL_FILES) {
      const code = codeOf(file);
      expect(code, file).not.toMatch(/from\s+["']react|\/>|<\/[A-Za-z]|return\s*\(?\s*<[A-Za-z]/);
      expect(ALL_HOOKS.test(code), file).toBe(false);
      expect(/\.(submit|play|pause|copyText)\(/.test(code), file).toBe(false);
    }
  });

  it("RF-06B files stay static: no hook, and no RF-06C browser adapter is imported by any RF-06D file", () => {
    for (const file of RF06B_CODE_FILES) expect(ALL_HOOKS.test(codeOf(file)), file).toBe(false);
    for (const file of RF06D_FILES) {
      for (const modulePath of resolvedImportsOf(file)) expect(modulePath, file).not.toMatch(/templates\/core/);
    }
  });

  it("the RF-06C browser-global owners are unchanged: nothing in RF-06D touches navigator, Audio, Date.now or intervals", () => {
    for (const [, pattern, owners] of RF06C_BROWSER_PRIVILEGE.filter(([label]) => label !== "React hooks")) {
      for (const file of RF06D_FILES) expect(pattern.test(codeOf(file)), file).toBe(false);
      expect(owners.every((owner) => RF06C_FILES.includes(owner as (typeof RF06C_FILES)[number]))).toBe(true);
    }
  });

  it("only the root and the gift section render islands, and only the root reads capabilities", () => {
    const islandImporters = [...RF06A_FILES, ...RF06B_CODE_FILES, ...RF06D_FILES].filter((file) =>
      resolvedImportsOf(file).some((modulePath) => modulePath.startsWith(`${RF06D_DIR}/`) && !/-(state|model)$/.test(modulePath)),
    );
    expect(islandImporters.sort()).toStrictEqual(
      [`${V1}/elegant-editorial-v1.tsx`, `${V1}/sections/gift.tsx`, `${V1}/sections/opening-cover.tsx`].sort(),
    );
    for (const file of RF06B_CODE_FILES) {
      if (file === `${V1}/elegant-editorial-v1.tsx`) continue;
      expect(/\bcapabilities\b/.test(codeOf(file)), file).toBe(false);
    }
  });

  it("the gift section adds a copy control only for a present clipboard and the canonical account number", () => {
    const code = codeOf(`${V1}/sections/gift.tsx`);
    expect(code).toMatch(
      /\{line\.key === "accountNumber" && clipboard !== undefined \? \(\s*<dd className=\{styles\.giftLineAction\}>\s*<CopyAccountButton clipboard=\{clipboard\} value=\{line\.value\} sideLabel=\{sideLabel\} \/>/,
    );
    expect(code.match(/<CopyAccountButton\b/g)).toHaveLength(1);
    // RF-06D remediation: one panel per present side, handed to the single dialog island.
    expect(code.match(/<GiftDialog\b/g)).toHaveLength(1);
    expect(code).toMatch(/<GiftDialog\s+panels=\{sides\.map\(/);
  });

  it("the music control is reachable only through the root's section-and-capability gate", () => {
    const root = codeOf(`${V1}/elegant-editorial-v1.tsx`);
    expect(root.match(/<MusicControl\b/g)).toHaveLength(1);
    expect(root.match(/<Countdown\b/g)).toHaveLength(1);
    expect(root.match(/<Rsvp\b/g)).toHaveLength(1);
    expect(codeOf(RF06D_MUSIC)).not.toMatch(/media\.audio|sections\.|isMusicCapabilityPermittedV1/);
  });

  it("no island declares a client or server boundary; the production host stays the only client entry", () => {
    for (const file of RF06D_FILES) expect(/["']use (client|server)["']/.test(readRepoFile(file)), file).toBe(false);
  });
});

// ===========================================================================
// VH-01 extension (docs/DECISIONS.md "VH-01 — Vietnamese Heritage v1
// Production Contract"). The second production renderer gets its own
// explicit lists and the same strictness as the RF-06A/RF-06B rules above;
// nothing above is weakened. VH-01 is static: no island, hook, capability
// read, decor file or motion yet. VH-02A (docs/DECISIONS.md "VH-02A …") adds
// exactly `sections/decor.tsx` (the only module naming decor files and the
// only inline SVG) and the pure `sections/gallery-layout.ts`, plus the eight
// authorized WebP derivatives; still static (no hook, island or motion).
// ===========================================================================

const VH = "templates/wedding/vietnamese-heritage/v1";
const VH01_MANIFEST_FILE = `${VH}/manifest.ts`;
const VH01_ROOT = `${VH}/vietnamese-heritage-v1.tsx`;
const VH01_FONTS = `${VH}/fonts.ts`;
const VH01_MEDIA_IMAGE = `${VH}/sections/media-image.tsx`;
const VH01_SECTIONS = [
  "ceremonial",
  "closing",
  "couple-name",
  "decor",
  "dress-code",
  "events",
  "gallery",
  "gift",
  "hero",
  "love-story",
  "media-image",
  "opening-cover",
  "song-hy",
  "timeline",
] as const;
const VH01_RENDERER_FILES = [
  VH01_ROOT,
  ...VH01_SECTIONS.map((section) => `${VH}/sections/${section}.tsx`),
] as const;
const VH01_CODE_FILES = [
  ...VH01_RENDERER_FILES,
  `${VH}/sections/date-text.ts`,
  `${VH}/sections/gallery-layout.ts`,
  `${VH}/copy.ts`,
  `${VH}/palette.ts`,
  VH01_FONTS,
] as const;
const VH01_CSS_FILE = `${VH}/vietnamese-heritage-v1.module.css`;
const VH01_PROVENANCE_FILE = `${VH}/PROVENANCE.md`;
const VH01_FILES = [VH01_MANIFEST_FILE, ...VH01_CODE_FILES, VH01_CSS_FILE, VH01_PROVENANCE_FILE] as const;

const VH_CSS = `${VH}/vietnamese-heritage-v1.module.css`;
const VH_SECTION_COMMON = [`${VH}/copy`, VH_CSS];
const VH_TYPES = `${LIB}/invitation-view-model-types`;
const VH_DATE = `${LIB}/event-date-time-presentation`;

/** VH-02B-E1: the Vietnamese Heritage interaction islands (rules in "VH-02B-E1 islands" below). */
const VH02B_RSVP = `${VH}/interactive/rsvp.tsx`;
const VH02B_GIFT_DIALOG = `${VH}/interactive/gift-dialog.tsx`;
const VH02B_COPY_BUTTON = `${VH}/interactive/copy-account-button.tsx`;
const VH02B_ISLAND_FILES = [VH02B_COPY_BUTTON, VH02B_GIFT_DIALOG, VH02B_RSVP] as const;
/** VH-02B-E1: the shared, framework-free interaction models the VH islands use. */
const VH02B_SHARED_RSVP_MODEL = `${LIB}/rsvp-form-model.ts`;
const VH02B_SHARED_COPY_MODEL = `${LIB}/clipboard-copy-feedback.ts`;

const VH_DECOR = `${VH}/sections/decor`;
const VH_DECOR_FILE = `${VH_DECOR}.tsx`;
/** VH-02A: the eight Product Owner-authorized WebP derivatives (on disk and as public URLs). */
const VH_DECOR_DIR = "public/renderers/wedding/vietnamese-heritage/v1";
const VH_DECOR_URL = "/renderers/wedding/vietnamese-heritage/v1/";
const VH_DECOR_FILES = [
  "border-left.webp",
  "border-right.webp",
  "floral-bottom-right.webp",
  "floral-top-left.webp",
  "gold-divider.webp",
  "medallion-double-happiness.webp",
  "paper-ivory.webp",
  "paper-red.webp",
] as const;

/** Exact import allowlist per VH code file (repository-relative, no extension; CSS keeps its extension). */
const VH01_ALLOWED_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  [VH01_ROOT]: [
    VH_DATE,
    `${LIB}/renderer-component`,
    `${VH}/fonts`,
    `${VH}/palette`,
    VH_CSS,
    VH_DECOR,
    `${VH}/interactive/rsvp`,
    ...["ceremonial", "closing", "dress-code", "events", "gallery", "gift", "hero", "love-story", "opening-cover", "timeline"].map(
      (section) => `${VH}/sections/${section}`,
    ),
  ],
  [`${VH}/copy.ts`]: [],
  [`${VH}/palette.ts`]: ["react"],
  [VH01_FONTS]: ["next/font/google"],
  [`${VH}/sections/date-text.ts`]: [VH_DATE],
  [`${VH}/sections/gallery-layout.ts`]: [VH_TYPES],
  [`${VH}/sections/couple-name.tsx`]: ["react", VH_CSS],
  [VH01_MEDIA_IMAGE]: [VH_TYPES],
  [VH_DECOR_FILE]: [VH_CSS],
  [`${VH}/sections/song-hy.tsx`]: [...VH_SECTION_COMMON, VH_DECOR],
  [`${VH}/sections/opening-cover.tsx`]: [
    VH_DATE,
    VH_TYPES,
    ...VH_SECTION_COMMON,
    `${VH}/sections/couple-name`,
    `${VH}/sections/date-text`,
    VH_DECOR,
  ],
  [`${VH}/sections/hero.tsx`]: [
    VH_DATE,
    VH_TYPES,
    ...VH_SECTION_COMMON,
    `${VH}/sections/couple-name`,
    `${VH}/sections/date-text`,
    VH_DECOR,
    `${VH}/sections/media-image`,
  ],
  [`${VH}/sections/ceremonial.tsx`]: [
    "react",
    VH_DATE,
    VH_TYPES,
    ...VH_SECTION_COMMON,
    VH_DECOR,
    `${VH}/sections/media-image`,
    `${VH}/sections/song-hy`,
  ],
  [`${VH}/sections/events.tsx`]: [VH_DATE, VH_TYPES, ...VH_SECTION_COMMON, `${VH}/sections/date-text`],
  [`${VH}/sections/timeline.tsx`]: [VH_TYPES, ...VH_SECTION_COMMON],
  [`${VH}/sections/love-story.tsx`]: [VH_TYPES, ...VH_SECTION_COMMON, `${VH}/sections/media-image`],
  // VH-02B-E1: the gift section renders the gift dialog and copy islands and types the clipboard capability.
  [`${VH}/sections/gift.tsx`]: [
    VH_TYPES,
    `${LIB}/renderer-capabilities`,
    `${LIB}/wedding-domain-types`,
    ...VH_SECTION_COMMON,
    `${VH}/interactive/copy-account-button`,
    `${VH}/interactive/gift-dialog`,
    `${VH}/sections/media-image`,
  ],
  [`${VH}/sections/dress-code.tsx`]: [VH_TYPES, ...VH_SECTION_COMMON],
  [`${VH}/sections/gallery.tsx`]: ["react", VH_TYPES, ...VH_SECTION_COMMON, VH_DECOR, `${VH}/sections/gallery-layout`, `${VH}/sections/media-image`],
  [`${VH}/sections/closing.tsx`]: [VH_DATE, VH_TYPES, ...VH_SECTION_COMMON, `${VH}/sections/date-text`, VH_DECOR, `${VH}/sections/song-hy`],
};

/** VH-01 additions to the RF-06B forbidden list: static renderer, own graph only. */
const VH01_EXTRA_FORBIDDEN: readonly [string, RegExp][] = [
  // VH-02B-E1: only the root reads `capabilities` (exempted below); a module path such as
  // `renderer-capabilities` is not a read.
  ["capabilities read outside the root", /(?<![-/])\bcapabilities\b/],
  ["Elegant Editorial coupling", /elegant-editorial|ELEGANT_EDITORIAL|ElegantEditorial/],
  ["templates/core import", /templates\/core|\.\.\/core\//],
  ["countdown / clock derivation", /ceremony-countdown|deriveCeremonyCountdown|ceremony-month-grid/],
  ["RSVP contract", /rsvp-capability|RsvpCapability/],
  ["raw Snapshot / payload", /snapshot-payload|SnapshotPayload|\bsnapshot\b/],
  ["design key branching", /paletteKey|fontPresetKey|effectPresetKey/],
  // VH-02A: decor paths are allowed only in sections/decor.tsx (exact rule below); prototype paths nowhere.
  ["prototype asset path or PNG/SVG file", /\/prototypes\/|\.png["'`]|\.svg["'`]/],
  ["Unicode Song Hỷ glyph (vector geometry only)", /囍/],
  ["demo/prototype content", /demo|DEMO_|PrototypeWeddingData|wedding-data|Sơn Trà|sông Hàn|A Thousand Years/],
  ["next/image", /next\/image/],
  ["IntersectionObserver / matchMedia / animation", /IntersectionObserver|matchMedia|framer|animate/],
];

describe("VH-01 Vietnamese Heritage v1 files", () => {
  it("every listed file exists and the allowlist covers exactly the code files", () => {
    for (const file of VH01_FILES) expect(() => readRepoFile(file), file).not.toThrow();
    expect(Object.keys(VH01_ALLOWED_IMPORTS).sort()).toStrictEqual([...VH01_CODE_FILES].sort());
  });

  it("the manifest is data only: type-only imports, no RF-06A forbidden code, and the only VH key literal outside the binding table", () => {
    const statements = importsOf(readRepoFile(VH01_MANIFEST_FILE));
    expect(statements).toStrictEqual([{ specifier: "../../../core/renderer-manifest", typeOnly: true }]);
    const code = stripComments(readRepoFile(VH01_MANIFEST_FILE));
    for (const [label, pattern] of RF06A_FORBIDDEN) {
      expect(pattern.test(code), `${VH01_MANIFEST_FILE}: ${label}`).toBe(false);
    }
    for (const file of [VH01_MANIFEST_FILE, ...VH01_CODE_FILES, ...RF06A_FILES, ...RF06B_CODE_FILES]) {
      const hasLiteral = /["'`]wedding\.vietnamese-heritage\.v1["'`]/.test(codeOf(file));
      expect(hasLiteral, file).toBe(file === VH01_MANIFEST_FILE || file === BINDINGS_MODULE);
    }
  });

  it.each(VH01_CODE_FILES)("%s imports only its exact allowlist", (file) => {
    expect([...new Set(resolvedImportsOf(file))].sort(), file).toStrictEqual([...new Set(VH01_ALLOWED_IMPORTS[file])].sort());
  });

  it.each(VH01_CODE_FILES)("%s contains no forbidden runtime, data, browser, prototype, interaction or capability code", (file) => {
    const code = codeOf(file);
    for (const [label, pattern] of [...RF06B_FORBIDDEN, ...VH01_EXTRA_FORBIDDEN]) {
      if (file === VH01_ROOT && label === "capabilities read outside the root") continue;
      expect(pattern.test(code), `${file}: ${label}`).toBe(false);
    }
    expect(ALL_HOOKS.test(code), `${file}: hooks`).toBe(false);
  });

  it("only the VH fonts module touches next/font, only next/font/google, with the three approved families", () => {
    for (const file of VH01_CODE_FILES) {
      const code = codeOf(file);
      expect(/next\/font/.test(code), file).toBe(file === VH01_FONTS);
      expect(/next\/font\/local/.test(code), file).toBe(false);
    }
    const fonts = codeOf(VH01_FONTS);
    expect([...fonts.matchAll(/\b(\w+)\(\{/g)].map((match) => match[1]).sort()).toStrictEqual(
      ["Cormorant_Garamond", "Great_Vibes", "Playfair_Display"].sort(),
    );
    expect(fonts.match(/subsets: \["latin", "vietnamese"\]/g)).toHaveLength(3);
    expect(fonts.match(/display: "swap"/g)).toHaveLength(3);
    // Never preloaded: the shared binding graph would otherwise preload them on Elegant Editorial routes too.
    expect(fonts.match(/preload: false/g)).toHaveLength(3);
    expect(fonts).not.toMatch(/preload: true/);
  });

  it("no VH file is a client or server boundary", () => {
    // Comments are stripped: the manifest's doc comment names the directive it must not have.
    for (const file of [VH01_MANIFEST_FILE, ...VH01_CODE_FILES]) {
      expect(/["']use (client|server)["']/.test(codeOf(file)), file).toBe(false);
    }
  });

  it("the root reads only the K6 props, and capabilities only as the RSVP gate and the clipboard passthrough", () => {
    const code = codeOf(VH01_ROOT);
    expect(code).toMatch(/export function VietnameseHeritageV1\(\{ viewModel, sections, capabilities \}: InvitationRendererPropsV1\)/);
    expect(code).not.toMatch(/manifest|rendererKey/);
    expect([...code.matchAll(/\bcapabilities\.(\w+)/g)].map((match) => match[1]).sort()).toStrictEqual(["clipboard", "rsvp", "rsvp"]);
    expect(code).toMatch(/\{capabilities\.rsvp !== undefined \? <Rsvp rsvp=\{capabilities\.rsvp\} \/> : null\}/);
    expect(code).toMatch(/\{sections\.gift \? <Gift [^>]*clipboard=\{capabilities\.clipboard\} \/> : null\}/);
    expect(code).not.toMatch(/capabilities\.(music|clock)/);
  });

  it("only the binding module imports the VH renderer component, and no VH file imports a template outside its own tree", () => {
    for (const file of [...RF06A_FILES, ...RF06B_CODE_FILES, ...RF06C_FILES, ...RF06D_FILES, ...VH01_CODE_FILES]) {
      expect(resolvedImportsOf(file).includes(`${VH}/vietnamese-heritage-v1`), file).toBe(file === BINDINGS_MODULE);
    }
    for (const file of [...VH01_CODE_FILES, ...VH02B_ISLAND_FILES]) {
      for (const modulePath of resolvedImportsOf(file)) {
        if (modulePath.startsWith("templates/")) expect(modulePath.startsWith(`${VH}/`), `${file} → ${modulePath}`).toBe(true);
      }
    }
  });

  it("<img> only in the media element and decor module; <svg> only in decor; no literal src/href", () => {
    for (const file of VH01_CODE_FILES) {
      const code = codeOf(file);
      expect(/<img\b/.test(code), file).toBe(file === VH01_MEDIA_IMAGE || file === VH_DECOR_FILE);
      expect(/<svg\b/.test(code), file).toBe(file === VH_DECOR_FILE);
      expect(/<image\b|<text\b|<use\b|xlink:href/.test(code), file).toBe(false);
      expect(code, file).not.toMatch(/\s(?:src|href)="[^"]*"/);
    }
    expect(codeOf(VH01_MEDIA_IMAGE)).toMatch(/src=\{media\.url\}/);
    expect(codeOf(VH_DECOR_FILE)).toMatch(/src=\{DECOR_SRC\[decor\]\}/);
  });

  it("decor paths appear only in decor.tsx, each an exact literal under the immutable v1 renderer path", () => {
    for (const file of VH01_CODE_FILES) {
      const code = codeOf(file);
      expect(/\/renderers\/|\.webp\b/.test(code), file).toBe(file === VH_DECOR_FILE);
    }
    const decor = codeOf(VH_DECOR_FILE);
    const paths = [...decor.matchAll(/["'(]((?:\/[\w.-]+)+\.webp)["')]/g)].map((match) => match[1]);
    expect([...decor.matchAll(/\/renderers\//g)]).toHaveLength(paths.length);
    for (const path of paths) expect(path.startsWith(VH_DECOR_URL), path).toBe(true);
    expect(paths.map((path) => path.slice(VH_DECOR_URL.length)).sort()).toStrictEqual([...VH_DECOR_FILES].sort());
    // Built from literals only: no template literal or concatenation produces a path.
    expect(decor).not.toMatch(/`[^`]*\/renderers|\/renderers[^"]*"\s*\+/);
  });

  it("VH-02A media model: layout media only from viewModel.media.templateSlots; never a legacy layout role", () => {
    const LEGACY = /media\.(cover|gallery|portrait|loveStoryPhoto|photoStory)\b|\bportrait\.(groom|bride)\b|\bmedia\.cover\b/;
    for (const file of VH01_CODE_FILES) {
      expect(LEGACY.test(codeOf(file)), file).toBe(false);
    }
    const root = codeOf(VH01_ROOT);
    expect(root).toMatch(/const slots = media\.templateSlots;/);
    for (const slot of ["heroPhoto", "portraitCluster", "loveStoryPhoto", "gallery"]) {
      expect(root, slot).toMatch(new RegExp(`slots\\?\\.${slot} \\?\\? \\[\\]`));
    }
    // The only other media read is the semantic QR.
    expect([...root.matchAll(/\bmedia\.(\w+)/g)].map((match) => match[1]).sort()).toStrictEqual(["qr", "templateSlots"]);
    // No slot falls back to another role or slot.
    expect(root).not.toMatch(/\?\?\s*media\./);
    // Portrait positions carry no person or side semantics.
    const ceremonial = codeOf(`${VH}/sections/ceremonial.tsx`);
    expect(ceremonial).not.toMatch(/portraitOf|person\.side|ViewModelPerson|CoupleSide|data-side=\{person/);
    expect(ceremonial).toMatch(/data-position=\{position\}/);
  });

  it("the provenance note records the Product Owner authorization, sources, derivatives and hashes", () => {
    const note = readRepoFile(VH01_PROVENANCE_FILE);
    for (const required of ["Source:", "Author / owner:", "Rights basis:", "Task 029", "VH-02A", "Allowed production use:** `wedding.vietnamese-heritage.v1`"]) {
      expect(note, required).toContain(required);
    }
    expect(note).not.toMatch(/BLOCKER for VH-02|not shipped; VH-02 blocker|are \*\*not\*\* copied into\s+production/);
    for (const file of [
      "heritage-border-left.png",
      "heritage-border-right.png",
      "heritage-corner-ornament.png",
      "heritage-double-happiness-medallion.png",
      "heritage-floral-bottom-right.png",
      "heritage-floral-top-left.png",
      "heritage-gold-divider.png",
      "heritage-lantern.png",
      "heritage-paper-ivory.png",
      "heritage-paper-red.png",
    ]) {
      expect(note, file).toMatch(new RegExp(`^\\| \`${file.replace(/[.]/g, "\\.")}\` \\|`, "m"));
    }
    for (const file of VH_DECOR_FILES) {
      const bytes = readFileSync(join(REPO_ROOT, VH_DECOR_DIR, file));
      const sha = createHash("sha256").update(bytes).digest("hex");
      const row = note.match(new RegExp(`^\\| \`${file.replace(/[.]/g, "\\.")}\` \\|.*$`, "m"))?.[0];
      expect(row, file).toBeDefined();
      expect(row, file).toContain(`| ${String(bytes.length)} |`);
      expect(row, file).toContain(sha);
    }
  });
});

describe("VH-02B-E1 islands", () => {
  const ALLOWED: Readonly<Record<(typeof VH02B_ISLAND_FILES)[number], readonly string[]>> = {
    [VH02B_RSVP]: ["react", "lib/domain", `${LIB}/rsvp-capability`, `${LIB}/rsvp-form-model`, `${VH}/copy`, VH_DECOR, VH_CSS],
    [VH02B_GIFT_DIALOG]: ["react", `${LIB}/wedding-domain-types`, `${VH}/copy`, VH_DECOR, VH_CSS],
    [VH02B_COPY_BUTTON]: ["react", `${LIB}/clipboard-copy-feedback`, `${LIB}/renderer-capabilities`, `${VH}/copy`, VH_CSS],
  };

  /** Each interaction primitive only in its owning VH island (least privilege, as RF-06D). */
  const PRIVILEGE: readonly [string, RegExp, readonly string[]][] = [
    ["useState", /\buseState\b/, [VH02B_RSVP, VH02B_GIFT_DIALOG, VH02B_COPY_BUTTON]],
    ["useReducer", /\buseReducer\b/, [VH02B_RSVP]],
    ["useRef", /\buseRef\b/, [VH02B_RSVP, VH02B_GIFT_DIALOG]],
    ["useEffect", /\buseEffect\b/, [VH02B_RSVP, VH02B_GIFT_DIALOG]],
    [
      "other hooks",
      /\buse(LayoutEffect|InsertionEffect|Memo|Callback|SyncExternalStore|Context|Transition|Optimistic|ActionState|Id|DeferredValue|ImperativeHandle)\b/,
      [],
    ],
    ["dialog element / API", /<dialog\b|role="dialog"|showModal|HTMLDialogElement|\.close\(\)|onClose\b|onCancel\b/, [VH02B_GIFT_DIALOG]],
    ["programmatic focus", /\.focus\(/, [VH02B_RSVP, VH02B_GIFT_DIALOG]],
    ["form events", /\bonSubmit\b|\bonChange\b|preventDefault/, [VH02B_RSVP]],
    ["form controls", /<form\b|<input\b|<select\b|<textarea\b|<fieldset\b|<label\b/, [VH02B_RSVP]],
    ["clipboard capability action", /copyWithFeedback|copyText/, [VH02B_COPY_BUTTON]],
    ["RSVP capability action", /\.submit\(|gate\.run\(/, [VH02B_RSVP]],
    ["music / clock / countdown", /\.play\(|\.pause\(|MusicCapabilityV1|nowEpochMs|ClockCapabilityV1|deriveCeremonyCountdownV1/, []],
    ["tabindex", /\btabIndex\b/, []],
  ];

  it("every island exists, is .tsx, and imports only its exact allowlist (no other template, no templates/core)", () => {
    expect(Object.keys(ALLOWED).sort()).toStrictEqual([...VH02B_ISLAND_FILES].sort());
    for (const file of VH02B_ISLAND_FILES) {
      expect(file.endsWith(".tsx"), file).toBe(true);
      expect([...new Set(resolvedImportsOf(file))].sort(), file).toStrictEqual([...ALLOWED[file]].sort());
    }
  });

  it.each(VH02B_ISLAND_FILES)("%s has no data, network, persistence, browser-global, time, identity or prototype code", (file) => {
    const code = codeOf(file);
    for (const [label, pattern] of RF06D_FORBIDDEN) {
      expect(pattern.test(code), `${file}: ${label}`).toBe(false);
    }
    for (const [label, pattern] of VH01_EXTRA_FORBIDDEN) {
      // The RSVP island is the one VH consumer of the frozen RSVP capability contract.
      if (file === VH02B_RSVP && label === "RSVP contract") continue;
      expect(pattern.test(code), `${file}: ${label}`).toBe(false);
    }
    expect(/<img\b|<svg\b/.test(code), file).toBe(false);
  });

  it.each(PRIVILEGE)("interaction: %s appears only in its owning VH island(s), never in a VH static file", (_label, pattern, owners) => {
    for (const file of VH02B_ISLAND_FILES) expect(pattern.test(codeOf(file)), file).toBe(owners.includes(file));
    for (const file of VH01_CODE_FILES) expect(pattern.test(codeOf(file)), file).toBe(false);
  });

  it("buttons and click handlers only in the islands; VH static files stay hook-free", () => {
    for (const file of VH01_CODE_FILES) {
      const code = codeOf(file);
      expect(/<button\b|\bonClick\b/.test(code), file).toBe(false);
      expect(ALL_HOOKS.test(code), file).toBe(false);
    }
  });

  it("only the root renders RSVP and only the gift section renders the gift islands", () => {
    const importersOf = (island: string) =>
      [...VH01_CODE_FILES, ...VH02B_ISLAND_FILES].filter((file) => resolvedImportsOf(file).includes(island.replace(/\.tsx$/, "")));
    expect(importersOf(VH02B_RSVP)).toStrictEqual([VH01_ROOT]);
    expect(importersOf(VH02B_GIFT_DIALOG)).toStrictEqual([`${VH}/sections/gift.tsx`]);
    expect(importersOf(VH02B_COPY_BUTTON)).toStrictEqual([`${VH}/sections/gift.tsx`]);
    const gift = codeOf(`${VH}/sections/gift.tsx`);
    expect(gift).toMatch(
      /\{line\.key === "accountNumber" && clipboard !== undefined \? \(\s*<dd className=\{styles\.giftLineAction\}>\s*<CopyAccountButton clipboard=\{clipboard\} value=\{line\.value\} sideLabel=\{sideLabel\} \/>/,
    );
    expect(gift.match(/<CopyAccountButton\b/g)).toHaveLength(1);
    expect(gift.match(/<GiftDialog\b/g)).toHaveLength(1);
    expect(gift).toMatch(/if \(panels\.length === 0\) \{\s*return null;\s*\}/);
  });

  it("no island declares a client or server boundary", () => {
    for (const file of VH02B_ISLAND_FILES) expect(/["']use (client|server)["']/.test(readRepoFile(file)), file).toBe(false);
  });

  it("the shared interaction models are pure: no React, DOM, browser API, storage, network or rendering", () => {
    for (const file of [VH02B_SHARED_RSVP_MODEL, VH02B_SHARED_COPY_MODEL]) {
      const code = codeOf(file);
      expect(code, file).not.toMatch(/from\s+["']react|\/>|<\/[A-Za-z]|return\s*\(?\s*<[A-Za-z]/);
      expect(ALL_HOOKS.test(code), file).toBe(false);
      for (const [label, pattern] of RF06D_FORBIDDEN) expect(pattern.test(code), `${file}: ${label}`).toBe(false);
    }
    expect(resolvedImportsOf(VH02B_SHARED_RSVP_MODEL).sort()).toStrictEqual(["lib/domain", `${LIB}/rsvp-capability`].sort());
    expect(resolvedImportsOf(VH02B_SHARED_COPY_MODEL)).toStrictEqual([`${LIB}/renderer-capabilities`]);
  });
});

describe("VH-02A decor files", () => {
  /** RIFF/WebP chunk ids and canvas size (VP8X, else the VP8/VP8L bitstream header). */
  function webpInfo(bytes: Buffer): { ids: string[]; width: number; height: number } {
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
    expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);
    const ids: string[] = [];
    let width = 0;
    let height = 0;
    for (let offset = 12; offset < bytes.length; ) {
      const id = bytes.subarray(offset, offset + 4).toString("latin1");
      const size = bytes.readUInt32LE(offset + 4);
      const data = offset + 8;
      ids.push(id);
      if (id === "VP8X") {
        width = bytes.readUIntLE(data + 4, 3) + 1;
        height = bytes.readUIntLE(data + 7, 3) + 1;
      } else if (id === "VP8 " && width === 0) {
        width = bytes.readUInt16LE(data + 6) & 0x3fff;
        height = bytes.readUInt16LE(data + 8) & 0x3fff;
      } else if (id === "VP8L" && width === 0) {
        const bits = bytes.readUInt32LE(data + 1);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
      }
      offset = data + size + (size % 2);
    }
    return { ids, width, height };
  }

  const read = (file: string): Buffer => readFileSync(join(REPO_ROOT, VH_DECOR_DIR, file));

  it("the v1 directory holds exactly the eight authorized derivatives (no lantern, no corner ornament)", () => {
    expect(readdirSync(join(REPO_ROOT, "public", "renderers", "wedding", "vietnamese-heritage"))).toStrictEqual(["v1"]);
    expect(readdirSync(join(REPO_ROOT, VH_DECOR_DIR)).sort()).toStrictEqual([...VH_DECOR_FILES]);
  });

  it("every file is a metadata-free WebP whose canvas matches the size reserved in decor.tsx", () => {
    const decor = codeOf(VH_DECOR_FILE);
    const urlByKey = new Map([...decor.matchAll(/(\w+): "\/renderers\/wedding\/vietnamese-heritage\/v1\/([\w-]+\.webp)"/g)].map((match) => [match[1], match[2]]));
    const sizeByFile = new Map(
      [...decor.matchAll(/(\w+): \[(\d+), (\d+)\]/g)].map((match) => [urlByKey.get(match[1] as string), [Number(match[2]), Number(match[3])]]),
    );
    for (const file of VH_DECOR_FILES) {
      const { ids, width, height } = webpInfo(read(file));
      expect(ids.filter((id) => !["VP8X", "ALPH", "VP8 ", "VP8L"].includes(id)), file).toStrictEqual([]);
      expect(ids.some((id) => id === "VP8 " || id === "VP8L"), file).toBe(true);
      if (file.startsWith("paper-")) {
        // Textures are painted via CSS custom properties, not <img>.
        expect([width, height], file).toStrictEqual([1240, 1240]);
      } else {
        expect([width, height], file).toStrictEqual(sizeByFile.get(file));
      }
    }
  });

  it("total decor weight stays the recorded ~0.56 MiB, well under the ~1 MiB P6 budget", () => {
    const total = VH_DECOR_FILES.reduce((sum, file) => sum + read(file).length, 0);
    expect(total).toBe(592382);
    expect(total).toBeLessThan(1024 * 1024);
  });
});

describe("VH-01 renderer CSS", () => {
  const cssCode = readRepoFile(VH01_CSS_FILE).replace(/\/\*[\s\S]*?\*\//g, "");

  it.each([
    ["runtime @import", /@import/],
    ["external/url resource", /url\(|https?:/],
    ["Tailwind directive", /@(tailwind|apply|layer|theme)\b/],
    ["global selector", /:global|(^|[\s,}])(html|body|:root)\b/m],
    ["viewport height", /\b100vh\b|\d+(\.\d+)?vh\b/],
    ["review frame width", /--frame-width/],
    ["prototype/global fonts", /Dancing Script|Playfair|Iowan|Cormorant|Great Vibes/],
    ["!important", /!important/],
    ["raw hex colour (palette.ts owns colours)", /#[0-9a-fA-F]{3,8}\b/],
    ["Elegant Editorial tokens", /--ee-/],
    ["VH-01 motion (VH-02 owns motion with its reduced-motion fallback)", /@keyframes|\banimation\b|\btransition\b/],
  ])("has no %s", (_label, pattern) => {
    expect(pattern.test(cssCode)).toBe(false);
  });

  it("uses only palette variables, the three font variables, the two decor textures and its own local properties", () => {
    const palette = codeOf(`${VH}/palette.ts`);
    const declared = new Set([...palette.matchAll(/"(--vh-[a-z-]+)": "#[0-9a-f]{6}"/g)].map((match) => match[1]));
    expect(declared.size).toBeGreaterThan(5);
    const fontVariables = ["--vh-font-serif", "--vh-font-display", "--vh-font-script"];
    // VH-02A: the paper textures are set only by sections/decor.tsx.
    const textures = [...codeOf(VH_DECOR_FILE).matchAll(/"(--vh-texture-[a-z]+)": 'url\("\/renderers\/wedding\/vietnamese-heritage\/v1\/[\w-]+\.webp"\)'/g)].map(
      (match) => match[1] as string,
    );
    expect(textures.sort()).toStrictEqual(["--vh-texture-ivory", "--vh-texture-red"]);
    // Layout helpers declared inside this CSS module (never colours).
    const local = new Set([...cssCode.matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)].map((match) => match[1]));
    for (const variable of local) expect(declared.has(variable) || textures.includes(variable as string), variable).toBe(false);
    for (const [, variable] of cssCode.matchAll(/var\((--[\w-]+)\)/g)) {
      expect(declared.has(variable) || fontVariables.includes(variable as string) || textures.includes(variable as string) || local.has(variable), variable).toBe(
        true,
      );
    }
  });

  it("every rule's selector list starts from a module class", () => {
    const selectors = [...cssCode.matchAll(/(^|[{}])\s*([^{}@;]+)\{/g)].map((match) => (match[2] as string).trim());
    expect(selectors.length).toBeGreaterThan(20);
    for (const list of selectors) {
      for (const selector of list.split(",").map((part) => part.trim())) {
        expect(selector, selector).toMatch(/^\.[a-zA-Z]/);
      }
    }
  });
});

// ===========================================================================
// TE-02 extension (docs/DECISIONS.md "TE-02"): the server-safe Template
// Editor Manifest files, outside every renderer-version directory. Their
// boundary rules live in editor-manifest-static-boundary.test.ts; only the
// exact tree membership is declared here.
// ===========================================================================

const TE02_FILES = [
  "templates/core/editor-manifest.ts",
  "templates/core/production-editor-manifests.ts",
  "templates/editor/wedding/elegant-editorial-v1.ts",
  "templates/editor/wedding/vietnamese-heritage-v1.ts",
] as const;
