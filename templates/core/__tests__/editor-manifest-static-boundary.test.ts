import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * TE-02 static boundary (docs/DECISIONS.md "TE-02"): the Template Editor
 * Manifest modules are server-safe metadata. They import no React, client,
 * CSS, font, asset, prototype, renderer component, capability, Supabase,
 * environment or app/** code, and they live outside every renderer-version
 * directory.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

const EDITOR_MANIFEST = "templates/core/editor-manifest.ts";
const PRODUCTION_EDITOR_MANIFESTS = "templates/core/production-editor-manifests.ts";
const EE_EDITOR = "templates/editor/wedding/elegant-editorial-v1.ts";
const VH_EDITOR = "templates/editor/wedding/vietnamese-heritage-v1.ts";
const TE02_FILES = [EDITOR_MANIFEST, PRODUCTION_EDITOR_MANIFESTS, EE_EDITOR, VH_EDITOR] as const;

/** Exact import allowlist per file, as repository-relative module paths (no extension). */
const ALLOWED_IMPORTS: Readonly<Record<(typeof TE02_FILES)[number], readonly string[]>> = {
  [EDITOR_MANIFEST]: ["lib/invitation-rendering/renderer-compatibility-manifest"],
  [PRODUCTION_EDITOR_MANIFESTS]: [
    "templates/editor/wedding/elegant-editorial-v1",
    "templates/editor/wedding/vietnamese-heritage-v1",
    "templates/core/editor-manifest",
    "templates/core/production-renderer-manifests",
    "templates/core/renderer-manifest",
  ],
  [EE_EDITOR]: ["templates/core/editor-manifest"],
  [VH_EDITOR]: ["templates/core/editor-manifest"],
};

const FORBIDDEN: readonly [string, RegExp][] = [
  ["React import", /from\s+["']react(-dom)?(\/[^"']*)?["']/],
  ["React JSX/runtime", /\bReact\b|\bjsx\b|createElement/],
  ["next import", /from\s+["']next(\/[^"']*)?["']/],
  ["next/font", /next\/font/],
  ["use client", /["']use client["']/],
  ["use server", /["']use server["']/],
  ["CSS import", /\.css["']/],
  ["tsx import", /\.tsx["']/],
  ["asset path", /\.(png|jpe?g|webp|svg|woff2?|mp3|m4a)["']|\/renderers\//],
  ["Supabase", /supabase/i],
  ["service_role", /service_role/],
  ["process.env", /process\.env/],
  ["fetch", /\bfetch\s*\(/],
  ["window", /\bwindow\b/],
  ["document", /\bdocument\b/],
  ["navigator", /\bnavigator\b/],
  ["storage", /\b(localStorage|sessionStorage)\b/],
  ["Audio", /\bAudio\b|HTMLAudioElement/],
  ["Date", /Date\.now|\bnew Date\b/],
  ["randomness", /Math\.random|randomUUID|getRandomValues/],
  ["timers", /\bset(Timeout|Interval)\b|requestAnimationFrame/],
  ["dynamic import", /\bimport\s*\(/],
  ["require", /\brequire\s*\(/],
  ["filesystem", /["']node:|["']fs["']|readdir|readFile|\bglob\b/],
  ["app import", /["'](\.\.\/)+app\/|["']app\//],
  ["prototype", /prototypes|_directions|GreenIvoryEditorialPrototype/],
  ["renderer component", /renderer-component|InvitationRendererComponent|renderer-binding|RendererBinding/],
  ["renderer implementation", /templates\/wedding\/|\/wedding\/(elegant-editorial|vietnamese-heritage)\/v\d/],
  ["host", /InvitationRendererHost|renderer-host/],
  ["capabilities", /renderer-capabilities|rsvp-capability|Capability\b|capabilities\./],
  ["view model / snapshot data", /invitation-view-model|snapshot-payload|InvitationViewModel|SnapshotPayload/],
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function importSpecifiers(source: string): string[] {
  const pattern = /^\s*(?:import|export)\s+(?:type\s+)?[^;]*?\sfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
  return [...stripComments(source).matchAll(pattern)].map((match) => (match[1] ?? match[2]) as string);
}

function resolveSpecifier(file: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  return toPosix(relative(REPO_ROOT, join(REPO_ROOT, file, "..", specifier)));
}

describe("TE-02 editor-manifest static boundary", () => {
  it("every file exists and is a .ts module", () => {
    for (const file of TE02_FILES) {
      expect(file.endsWith(".ts")).toBe(true);
      expect(() => readRepoFile(file), file).not.toThrow();
    }
  });

  it("templates/editor/** contains exactly the two production editor manifests", () => {
    const files = readdirSync(join(REPO_ROOT, "templates", "editor"), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => toPosix(relative(REPO_ROOT, join(entry.parentPath, entry.name))))
      .sort();
    expect(files).toStrictEqual([EE_EDITOR, VH_EDITOR]);
  });

  it("no editor manifest lives inside a renderer-version directory", () => {
    for (const dir of ["templates/wedding/elegant-editorial/v1", "templates/wedding/vietnamese-heritage/v1"]) {
      const names = readdirSync(join(REPO_ROOT, dir), { recursive: true }).map(String);
      expect(names.some((name) => /editor-manifest/.test(name)), dir).toBe(false);
    }
  });

  it.each(TE02_FILES)("%s contains no forbidden runtime, client, renderer or data code", (file) => {
    const code = stripComments(readRepoFile(file));
    for (const [label, pattern] of FORBIDDEN) {
      expect(pattern.test(code), `${file}: ${label}`).toBe(false);
    }
  });

  it.each(TE02_FILES)("%s imports only its exact allowlist", (file) => {
    const resolved = importSpecifiers(readRepoFile(file)).map((specifier) => resolveSpecifier(file, specifier));
    expect(resolved.length).toBeGreaterThan(0);
    for (const modulePath of resolved) {
      expect(ALLOWED_IMPORTS[file], `${file} imports ${modulePath}`).toContain(modulePath);
    }
  });

  it("the per-template editor manifests import types only", () => {
    for (const file of [EE_EDITOR, VH_EDITOR]) {
      const statements = stripComments(readRepoFile(file)).match(/^\s*import\s.*$/gm) ?? [];
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) expect(statement, file).toMatch(/^\s*import\s+type\s/);
    }
  });

  it("the production editor list is explicit and in production renderer order", () => {
    const code = stripComments(readRepoFile(PRODUCTION_EDITOR_MANIFESTS));
    expect(code).toMatch(/\[ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST, VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST\]/);
    expect(/["'`]wedding\.[\w-]+\.v\d+/.test(code)).toBe(false);
  });

  // TE-05A re-scope (checkpoint maintenance): the Staff catalog route
  // (app/api/v2/internal/**) may look manifests up server-side and the admin
  // UI may import the editor-manifest TYPES; renderers, invitation-facing
  // pages and every client module still never import manifest values.
  it("no renderer, invitation-facing page or client module imports editor manifest values (never read at render time)", () => {
    const roots = ["templates/wedding", "templates/core/client", "app"];
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== "__tests__") walk(path);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const code = readRepoFile(path);
          const valueImport = importSpecifiers(code.replace(/^\s*import\s+type\s[^;]*;/gm, "")).some((specifier) =>
            /editor-manifest|templates\/editor\/|\.\.\/editor\//.test(specifier),
          );
          const typeImport = /editor-manifest|templates\/editor\//.test(code);
          const staffServerRoute = path.startsWith("app/api/v2/internal/") && !/["']use client["']/.test(code);
          if ((valueImport && !staffServerRoute) || (typeImport && /^(templates\/|app\/(i|review|portal|internal)\/)/.test(path))) {
            offenders.push(path);
          }
        }
      }
    };
    for (const root of roots) walk(root);
    for (const host of ["templates/core/invitation-renderer-host.tsx", "templates/core/production-renderer-bindings.ts"]) {
      if (/editor-manifest|templates\/editor\/|\.\.\/editor\//.test(readRepoFile(host))) offenders.push(host);
    }
    expect(offenders).toStrictEqual([]);
  });
});
