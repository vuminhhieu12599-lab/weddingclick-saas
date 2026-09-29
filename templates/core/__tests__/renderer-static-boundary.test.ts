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
  ["MAYBE attendance", /\bMAYBE\b/],
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
    expect(code).toContain("validateProductionRendererManifests([ELEGANT_EDITORIAL_V1_MANIFEST])");
    expect(/["'`]wedding\.[\w-]+\.v\d+/.test(code)).toBe(false);
  });

  it("the production renderer key literal appears only in the v1 manifest constant", () => {
    for (const file of RF06A_FILES) {
      const hasLiteral = /["'`]wedding\.elegant-editorial\.v1["'`]/.test(stripComments(readRepoFile(file)));
      expect(hasLiteral, file).toBe(file === "templates/wedding/elegant-editorial/v1/manifest.ts");
    }
  });
});

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
  it("templates/** contains exactly the RF-06A and RF-06B files", () => {
    expect([...sources].sort()).toStrictEqual([...RF06A_FILES, ...RF06B_TEMPLATE_FILES].sort());
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
    /\bMAYBE\b/,
    /fonts\.(googleapis|gstatic)\.com/,
  ];

  it.each(sources)("%s obeys the universal templates/** rules", (file) => {
    const code = stripComments(readRepoFile(file));
    for (const pattern of UNIVERSAL_FORBIDDEN) {
      expect(pattern.test(code), `${file}: ${String(pattern)}`).toBe(false);
    }
  });
});

// ===========================================================================
// RF-06B extension (docs/DECISIONS.md "RF-06-0 …" P2–P6, P22–P27, P38–P39).
// Everything above is the unchanged RF-06A boundary; RF-06B adds explicit
// lists and rules here and weakens none of them.
// ===========================================================================

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
  `${V1}/sections/events.tsx`,
  `${V1}/sections/families.tsx`,
  `${V1}/sections/gallery.tsx`,
  `${V1}/sections/gift.tsx`,
  `${V1}/sections/hero.tsx`,
  `${V1}/sections/invitation-message.tsx`,
  `${V1}/sections/love-story.tsx`,
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
    "templates/core/production-renderer-manifests",
    "templates/core/renderer-manifest",
  ],
  "templates/core/invitation-renderer-host.tsx": [
    `${LIB}/invitation-view-model-types`,
    `${LIB}/renderer-binding-registry`,
    `${LIB}/renderer-capabilities`,
    `${LIB}/renderer-selection`,
    "templates/core/production-renderer-bindings",
  ],
  [`${V1}/elegant-editorial-v1.tsx`]: [
    `${LIB}/ceremony-month-grid`,
    `${LIB}/event-date-time-presentation`,
    `${LIB}/renderer-component`,
    `${V1}/copy`,
    CSS_MODULE,
    `${V1}/fonts`,
    `${V1}/palette`,
    ...[
      "calendar",
      "ceremony",
      "closing",
      "couple",
      "events",
      "families",
      "gallery",
      "gift",
      "hero",
      "invitation-message",
      "love-story",
      "opening-cover",
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
  ],
  [`${V1}/sections/couple.tsx`]: [`${LIB}/invitation-view-model-types`, ...SECTION_COMMON],
  [`${V1}/sections/date-text.ts`]: [`${LIB}/event-date-time-presentation`],
  [`${V1}/sections/decor.tsx`]: [CSS_MODULE],
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
  ],
  [`${V1}/sections/hero.tsx`]: [
    `${LIB}/event-date-time-presentation`,
    `${LIB}/invitation-view-model-types`,
    ...SECTION_COMMON,
    `${V1}/sections/date-text`,
    `${V1}/sections/decor`,
    `${V1}/sections/media-image`,
  ],
  [`${V1}/sections/invitation-message.tsx`]: SECTION_COMMON,
  [`${V1}/sections/love-story.tsx`]: SECTION_COMMON,
  [`${V1}/sections/media-image.tsx`]: [`${LIB}/invitation-view-model-types`],
  [`${V1}/sections/opening-cover.tsx`]: [
    `${LIB}/event-date-time-presentation`,
    `${LIB}/invitation-view-model-types`,
    ...SECTION_COMMON,
    `${V1}/sections/date-text`,
    `${V1}/sections/decor`,
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
  ["MAYBE attendance", /\bMAYBE\b/],
  ["common QR", /QR_COMMON|commonMediaId|qr\.common/],
  ["additional note", /additional_?note/i],
  ["prototype location fiction", /Đà Nẵng/],
  ["external font URL", /fonts\.(googleapis|gstatic)\.com/],
  ["review frame width", /--frame-width/],
  ["RF-06C/D capability or interaction", /\bonClick\b|<button|<form|<input|<dialog|role="dialog"|copyText|\.play\(|nowEpochMs/],
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
  it("every listed file exists; .tsx and CSS live only in the RF-06B renderer/host scope", () => {
    for (const file of RF06B_TEMPLATE_FILES) expect(() => readRepoFile(file), file).not.toThrow();
    const sources = listSources(TEMPLATES_ROOT);
    for (const file of sources.filter((source) => /\.(tsx|css)$/.test(source))) {
      expect([HOST_MODULE, RF06B_CSS_FILE, ...RF06B_RENDERER_FILES], file).toContain(file);
    }
    expect(sources.filter((source) => source.endsWith(".css"))).toStrictEqual([RF06B_CSS_FILE]);
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

  it("the host passes exactly the empty closed capability object and takes no capability input", () => {
    const code = codeOf(HOST_MODULE);
    expect(code).toContain("export const EMPTY_CAPABILITIES: InvitationRendererCapabilitiesV1 = Object.freeze({});");
    expect(code).toMatch(/<Renderer viewModel=\{viewModel\} sections=\{sections\} capabilities=\{EMPTY_CAPABILITIES\} \/>/);
    expect(code).not.toMatch(/\btry\b|\bcatch\b|capabilityOverrides|harnessCapabilities/);
    const props = /interface InvitationRendererHostProps \{([\s\S]*?)\}/.exec(code)?.[1] ?? "";
    expect([...props.matchAll(/readonly (\w+):/g)].map((match) => match[1])).toStrictEqual([
      "rendererKey",
      "viewModel",
      "sections",
    ]);
  });

  it("the renderer root reads only the K6 props and never a manifest prop", () => {
    const code = codeOf(`${V1}/elegant-editorial-v1.tsx`);
    expect(code).toMatch(/export function ElegantEditorialV1\(\{ viewModel, sections \}: InvitationRendererPropsV1\)/);
    expect(code).not.toMatch(/manifest|rendererKey|capabilities\./);
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
    ["motion (RF-06D)", /@keyframes|\banimation\b|\btransition\b/],
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

  it("every rule's selector list starts from a module class", () => {
    const selectors = [...cssCode.matchAll(/(^|[{}])\s*([^{}@;]+)\{/g)].map((match) => (match[2] as string).trim());
    expect(selectors.length).toBeGreaterThan(20);
    for (const list of selectors) {
      for (const selector of splitSelectorList(list)) {
        expect(selector, selector).toMatch(/^\.[a-zA-Z]/);
      }
    }
  });
});

describe("RF-06B decor and provenance (P4–P6)", () => {
  it("no production asset directory exists: v1 decor is original inline SVG", () => {
    expect(() => readdirSync(join(REPO_ROOT, "public", "renderers"))).toThrow();
  });

  it("the provenance note lives in the v1 template directory and records source, owner and rights basis", () => {
    const note = readRepoFile(RF06B_PROVENANCE_FILE);
    for (const required of ["Source:", "Author / owner:", "External sources:", "Rights basis:", "Task 029", "RF-06B"]) {
      expect(note, required).toContain(required);
    }
  });

  it("decor is inline vector geometry only: no image element, href or data URI", () => {
    const code = codeOf(`${V1}/sections/decor.tsx`);
    expect(code).not.toMatch(/<image|<img|href|data:|url\(|base64/);
  });
});

// ---------------------------------------------------------------------------
// Internal renderer harness (P23, P25, P38, P39)
// ---------------------------------------------------------------------------

const HARNESS_ROOT = "app/internal/renderer-harness";
const HARNESS_GATE = `${HARNESS_ROOT}/layout.tsx`;
const HARNESS_PAGE = `${HARNESS_ROOT}/page.tsx`;
const HARNESS_WRAPPER = `${HARNESS_ROOT}/renderer-harness-client.tsx`;
const HARNESS_SCENARIOS = `${HARNESS_ROOT}/harness-scenarios.ts`;
const HARNESS_FILES = [HARNESS_GATE, HARNESS_PAGE, HARNESS_WRAPPER, HARNESS_SCENARIOS] as const;

const HARNESS_ALLOWED_IMPORTS: Readonly<Record<(typeof HARNESS_FILES)[number], readonly string[]>> = {
  [HARNESS_GATE]: ["next", "next/navigation"],
  [HARNESS_PAGE]: ["next/link", "next/navigation", `${HARNESS_ROOT}/harness-scenarios`, `${HARNESS_ROOT}/renderer-harness-client`],
  [HARNESS_WRAPPER]: [`${LIB}/invitation-view-model-types`, `${LIB}/renderer-selection`, "templates/core/invitation-renderer-host"],
  [HARNESS_SCENARIOS]: [
    `${LIB}/invitation-view-model-types`,
    `${LIB}/renderer-selection`,
    `${LIB}/snapshot-payload-types`,
    "templates/core/fixtures/renderer-fixture-pipeline",
    "templates/core/fixtures/renderer-fixture-sources",
  ],
};

describe("internal renderer harness boundary", () => {
  it("the harness tree is exactly the gate, page, wrapper and scenario module", () => {
    expect(listSources(join(REPO_ROOT, HARNESS_ROOT)).sort()).toStrictEqual([...HARNESS_FILES].sort());
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
    expect(/["']use client["']/.test(readRepoFile(HARNESS_PAGE))).toBe(false);
    expect(/["']use client["']/.test(readRepoFile(HARNESS_SCENARIOS))).toBe(false);
    expect(readRepoFile(HARNESS_WRAPPER).startsWith('"use client";\n')).toBe(true);
  });

  it("the wrapper constructs no capability or callback in RF-06B", () => {
    const code = codeOf(HARNESS_WRAPPER);
    expect(code).not.toMatch(/capabilit|rsvp|clipboard|music|clock|useState|useEffect/i);
    expect(code).toMatch(/<InvitationRendererHost rendererKey=\{rendererKey\} viewModel=\{viewModel\} sections=\{sections\} \/>/);
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
      /\bMAYBE\b/,
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

  it("reaches only react, next/font/google and repository modules", () => {
    expect(graph.external).toStrictEqual(["next/font/google"]);
  });

  /** P37/P45: pure modules under a server path, recorded debt; nothing else under lib/server may be reached. */
  const RF05C_TIMESTAMP_VALIDATOR = "lib/server/validation/timestamptz.ts";

  it("the only lib/server modules reached are the two recorded pure validators (P37, P45)", () => {
    expect(graph.files.filter((file) => file.startsWith("lib/server"))).toStrictEqual(
      [RF05C_TIMESTAMP_VALIDATOR, TASK028_VALIDATOR].sort(),
    );
    expect(importsOf(readRepoFile(RF05C_TIMESTAMP_VALIDATOR))).toStrictEqual([]);
  });

  it("reaches no fixtures, harness, prototypes or RF-06C/D modules", () => {
    for (const file of graph.files) {
      expect(file).not.toMatch(/fixtures|renderer-harness|prototypes|_directions|rsvp-capability/);
    }
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
