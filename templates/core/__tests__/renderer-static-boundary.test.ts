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

  it("RF-06A adds only the listed .ts modules: no React, CSS, font or asset files", () => {
    expect([...sources].sort()).toStrictEqual([...RF06A_FILES].sort());
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
