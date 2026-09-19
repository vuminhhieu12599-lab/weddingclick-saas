import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security review for Task 026 Phase 2 (token crypto + server-only
 * resolution foundation), covering the checks listed in the task spec §22.
 * Distinct from lib/server/access-links/__tests__/static-security-review.test.ts,
 * which reviews the frozen, already-committed Phase 1 migration
 * (0025_access_link_actions.sql) and must not be edited by this phase.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");

const SERVICE_ROLE_CLIENT_PATH = "lib/server/supabase/service-role-client.ts";
const RESOLUTION_REPOSITORY_PATH = "lib/server/supabase/access-link-resolution-repository.ts";

const PHASE_2_PRODUCTION_FILES = [
  "lib/server/auth/access-token-crypto.ts",
  "lib/server/access-links/access-link-resolution-types.ts",
  "lib/server/access-links/resolve-access-link.ts",
  "lib/server/supabase/service-role-client.ts",
  "lib/server/supabase/access-link-resolution-repository.ts",
  "lib/server/supabase/postgres-bytea.ts",
];

const PHASE_1_TRUSTED_MUTATION_FILES = ["lib/server/access-links/access-link-rpc-error-codes.ts"];

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const SKIP_DIR_NAMES = new Set(["node_modules", ".next", ".git", "__tests__"]);

/** Recursively lists every .ts/.tsx file under `dir` (repo-relative), skipping test/build dirs. */
function listProductionTsFiles(dir: string): string[] {
  const absoluteDir = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(absoluteDir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry)) {
      continue;
    }
    const absolutePath = join(absoluteDir, entry);
    const stat = statSync(absolutePath);
    const relPath = relative(ROOT, absolutePath);
    if (stat.isDirectory()) {
      files.push(...listProductionTsFiles(relPath));
    } else if (/\.tsx?$/.test(entry)) {
      files.push(relPath);
    }
  }
  return files;
}

/**
 * Every actual TS/TSX production root at repo top level (repo root has only
 * app/, lib/, components/ as TS source roots — supabase/ is SQL and docs/ is
 * Markdown, confirmed by directory listing; see task026-phase2-review.txt §5
 * for the same inventory independently confirmed via a full-repo grep).
 */
const PRODUCTION_ROOTS = ["lib", "app", "components"];

const ALL_PRODUCTION_FILES = PRODUCTION_ROOTS.flatMap((root) => listProductionTsFiles(root));

/**
 * Extracts every local-module import specifier a file references: static
 * `import ... from "..."`, side-effect `import "..."`, `export ... from
 * "..."` / `export * from "..."` re-exports (barrels), and dynamic
 * `import("...")`. Intentionally comment-blind and conservative — a
 * commented-out or otherwise inert specifier can still be "found" here,
 * which only widens the import graph and can never hide a real edge.
 */
function extractImportSpecifiers(contents: string): string[] {
  const specifiers: string[] = [];
  const staticPattern = /\b(?:import|export)\b[^'";]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = staticPattern.exec(contents)) !== null) {
    specifiers.push(match[1] ?? match[2]);
  }
  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = dynamicPattern.exec(contents)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

/**
 * Resolves a local import specifier (relative, or the `@/*` -> `./*`
 * tsconfig alias) to a repo-relative file path. Returns null for a
 * third-party package specifier (no leading `.` or `@/`) — those are never
 * local graph edges.
 */
function resolveLocalImport(fromFile: string, specifier: string): string | null {
  let basePath: string;
  if (specifier.startsWith(".")) {
    basePath = join(dirname(fromFile), specifier);
  } else if (specifier.startsWith("@/")) {
    basePath = specifier.slice(2);
  } else {
    return null;
  }

  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    join(basePath, "index.ts"),
    join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    const normalized = relative(ROOT, join(ROOT, candidate));
    const absolute = join(ROOT, normalized);
    if (existsSync(absolute) && statSync(absolute).isFile()) {
      return normalized;
    }
  }
  return null;
}

/** Builds the smallest reliable local-module import graph for `files`. */
function buildImportGraph(files: string[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const specifiers = extractImportSpecifiers(readFile(file));
    const edges = specifiers
      .map((spec) => resolveLocalImport(file, spec))
      .filter((resolved): resolved is string => resolved !== null);
    graph.set(file, edges);
  }
  return graph;
}

/**
 * Cycle-safe reachability check: true if `target` is reachable from `start`
 * by following zero or more edges in `graph`. A file always "reaches"
 * itself's own direct edges only — self-loops and cycles never loop forever
 * because of the `visited` guard.
 */
function reaches(graph: Map<string, string[]>, start: string, target: string): boolean {
  const visited = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === target) {
      return true;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const neighbor of graph.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }
  return false;
}

function isClientModule(file: string): boolean {
  return /^\s*["']use client["'];?/.test(readFile(file));
}

describe("Task 026 Phase 2 — SUPABASE_SERVICE_ROLE_KEY reference boundary", () => {
  it("only service-role-client.ts actually reads process.env.SUPABASE_SERVICE_ROLE_KEY (prose mentions elsewhere, e.g. doc comments, are not env reads)", () => {
    const ENV_READ_PATTERN = /process\.env\.SUPABASE_SERVICE_ROLE_KEY/;
    const referencing = ALL_PRODUCTION_FILES.filter((f) => ENV_READ_PATTERN.test(readFile(f)));
    expect(referencing).toEqual([SERVICE_ROLE_CLIENT_PATH]);
  });

  it("no file anywhere defines a NEXT_PUBLIC service-role variable", () => {
    for (const file of ALL_PRODUCTION_FILES) {
      expect(readFile(file)).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
      expect(readFile(file)).not.toMatch(/NEXT_PUBLIC_SERVICE_ROLE/);
    }
  });

  it("service-role-client.ts never falls back to the anon key", () => {
    expect(readFile(SERVICE_ROLE_CLIENT_PATH)).not.toMatch(/ANON_KEY/);
  });
});

describe("Task 026 Phase 2 — service-role client import boundary (§7)", () => {
  const IMPORT_PATTERN = /from\s+["'][^"']*service-role-client["']/;

  it("only the resolution repository imports service-role-client.ts", () => {
    const importers = ALL_PRODUCTION_FILES.filter(
      (f) => f !== SERVICE_ROLE_CLIENT_PATH && IMPORT_PATTERN.test(readFile(f)),
    );
    expect(importers).toEqual([RESOLUTION_REPOSITORY_PATH]);
  });

  it("no app/ file (client components, browser modules, or any route) imports service-role-client.ts", () => {
    const appImporters = listProductionTsFiles("app").filter((f) =>
      IMPORT_PATTERN.test(readFile(f)),
    );
    expect(appImporters).toEqual([]);
  });

  it("no components/ file imports service-role-client.ts", () => {
    const componentImporters = listProductionTsFiles("components").filter((f) =>
      IMPORT_PATTERN.test(readFile(f)),
    );
    expect(componentImporters).toEqual([]);
  });

  it("crypto utility never imports or mentions service_role", () => {
    const contents = readFile("lib/server/auth/access-token-crypto.ts");
    expect(contents).not.toMatch(IMPORT_PATTERN);
    expect(contents).not.toMatch(/service_role/i);
  });

  it.each(PHASE_1_TRUSTED_MUTATION_FILES)(
    "Phase 1 trusted mutation module %s never references service_role",
    (relativePath) => {
      expect(readFile(relativePath)).not.toMatch(/service_role/i);
      expect(readFile(relativePath)).not.toMatch(IMPORT_PATTERN);
    },
  );

  it("lib/server/supabase/staff-client.ts never imports service-role-client.ts", () => {
    expect(readFile("lib/server/supabase/staff-client.ts")).not.toMatch(IMPORT_PATTERN);
  });
});

describe("Task 026 Phase 2 — resolution repository query shape (§9/§10/§12)", () => {
  const contents = readFile(RESOLUTION_REPOSITORY_PATH);

  it("never SELECTs *", () => {
    expect(contents).not.toMatch(/select\(\s*["']\*["']\s*\)/);
  });

  it("never inserts or deletes project_access_links rows", () => {
    expect(contents).not.toMatch(/\.insert\(/);
    expect(contents).not.toMatch(/\.delete\(/);
  });

  it("its only .update(...) call sets last_used_at, and nothing else", () => {
    const updateMatches = [...contents.matchAll(/\.update\(\{([^}]*)\}\)/g)];
    expect(updateMatches).toHaveLength(1);
    const payload = updateMatches[0][1];
    expect(payload).toMatch(/last_used_at/);
    expect(payload).not.toMatch(/revoked_at/);
    expect(payload).not.toMatch(/expires_at/);
    expect(payload).not.toMatch(/token_hash/);
    expect(payload).not.toMatch(/token_hint/);
  });

  it("only queries the project_access_links table — never guests", () => {
    const fromMatches = [...contents.matchAll(/\.from\(\s*["']([^"']+)["']\s*\)/g)];
    expect(fromMatches.length).toBeGreaterThan(0);
    for (const match of fromMatches) {
      expect(match[1]).toBe("project_access_links");
    }
    expect(contents).not.toMatch(/["']guests["']/);
  });
});

describe("Task 026 Phase 2 — no guest token table touched anywhere in this phase (§17)", () => {
  it.each(PHASE_2_PRODUCTION_FILES)("%s never references guests.token_hash/token_hint/revoked_at or a guests table", (relativePath) => {
    const contents = readFile(relativePath);
    expect(contents).not.toMatch(/guests\.token_hash/);
    expect(contents).not.toMatch(/guests\.token_hint/);
    expect(contents).not.toMatch(/["']guests["']/);
  });
});

describe("Task 026 Phase 2 — no HTTP route added (§18)", () => {
  it("no app/api file references resolveAccessLink or the resolution repository", () => {
    const apiFiles = listProductionTsFiles("app/api");
    for (const file of apiFiles) {
      const contents = readFile(file);
      expect(contents).not.toMatch(/resolveAccessLink/);
      expect(contents).not.toMatch(/access-link-resolution/);
    }
  });

  it("no app/api route path segment names resolve/access-link/token", () => {
    const apiFiles = listProductionTsFiles("app/api");
    for (const file of apiFiles) {
      expect(file.toLowerCase()).not.toMatch(/resolve|access-link/);
    }
  });
});

describe("Task 026 Phase 2 — no raw token/secret material logged (§16)", () => {
  it.each(PHASE_2_PRODUCTION_FILES)("%s never calls console.* or a logger", (relativePath) => {
    const contents = readFile(relativePath);
    expect(contents).not.toMatch(/console\./);
    expect(contents).not.toMatch(/\blogger\b/);
  });

  it.each(PHASE_2_PRODUCTION_FILES)("%s never JSON.stringifies request material", (relativePath) => {
    expect(readFile(relativePath)).not.toMatch(/JSON\.stringify/);
  });

  it("resolve-access-link.ts never interpolates rawToken/tokenHash/tokenHint into a string", () => {
    const contents = readFile("lib/server/access-links/resolve-access-link.ts");
    expect(contents).not.toMatch(/\$\{[^}]*rawToken[^}]*\}/);
    expect(contents).not.toMatch(/\$\{[^}]*tokenHash[^}]*\}/);
    expect(contents).not.toMatch(/\$\{[^}]*tokenHint[^}]*\}/);
  });
});

describe("Task 026 Phase 2 — no logging of the service-role key (§16, §6)", () => {
  it("service-role-client.ts never logs or interpolates the resolved env values", () => {
    const contents = readFile(SERVICE_ROLE_CLIENT_PATH);
    expect(contents).not.toMatch(/console\./);
    expect(contents).not.toMatch(/\$\{[^}]*serviceRoleKey[^}]*\}/);
    expect(contents).not.toMatch(/\$\{[^}]*supabaseUrl[^}]*\}/);
  });
});

describe("Task 026 Phase 2 — ApiError extension (§5)", () => {
  it("EXPIRED_TOKEN and REVOKED_TOKEN are present in the ApiErrorKind union, alongside every prior kind", () => {
    const contents = readFile("lib/server/errors/api-error.ts");
    for (const kind of [
      "BAD_REQUEST",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "INVARIANT",
      "EXPIRED_TOKEN",
      "REVOKED_TOKEN",
      "INTERNAL",
    ]) {
      expect(contents).toMatch(new RegExp(`"${kind}"`));
    }
  });
});

describe("Task 026 Phase 2 — indirect (transitive) client-reachability to service-role-client.ts", () => {
  const importGraph = buildImportGraph(ALL_PRODUCTION_FILES);
  const clientModules = ALL_PRODUCTION_FILES.filter(isClientModule);

  it("finds at least one \"use client\" production module to check (the check below is not vacuously true)", () => {
    expect(clientModules.length).toBeGreaterThan(0);
  });

  it.each(clientModules)(
    "%s never directly or transitively imports service-role-client.ts",
    (file) => {
      const reachable = reaches(importGraph, file, SERVICE_ROLE_CLIENT_PATH);
      expect(reachable).toBe(false);
    },
  );

  it("the resolution repository is the only node with a direct edge to service-role-client.ts, across the whole graph", () => {
    const directImporters = ALL_PRODUCTION_FILES.filter((file) =>
      (importGraph.get(file) ?? []).includes(SERVICE_ROLE_CLIENT_PATH),
    );
    expect(directImporters).toEqual([RESOLUTION_REPOSITORY_PATH]);
  });
});

describe("Task 026 Phase 2 — import-graph extraction/traversal correctness (self-test)", () => {
  it("extractImportSpecifiers finds relative, aliased, side-effect, and re-export (barrel) specifiers", () => {
    const source = `
      import { a } from "./a";
      import b from '../b';
      import "./side-effect";
      export { c } from "@/lib/server/c";
      export * from "./barrel";
      const dyn = () => import("./lazy");
    `;
    expect(extractImportSpecifiers(source)).toEqual(
      expect.arrayContaining([
        "./a",
        "../b",
        "./side-effect",
        "@/lib/server/c",
        "./barrel",
        "./lazy",
      ]),
    );
  });

  it("extractImportSpecifiers ignores third-party bare specifiers as a source string (resolveLocalImport separately filters them to null)", () => {
    const source = `import { createClient } from "@supabase/supabase-js";`;
    expect(extractImportSpecifiers(source)).toEqual(["@supabase/supabase-js"]);
    expect(resolveLocalImport("lib/server/supabase/x.ts", "@supabase/supabase-js")).toBeNull();
  });

  it("resolveLocalImport resolves a real relative import to its repo-relative path with extension", () => {
    expect(
      resolveLocalImport(
        "lib/server/access-links/resolve-access-link.ts",
        "../supabase/access-link-resolution-repository",
      ),
    ).toBe(RESOLUTION_REPOSITORY_PATH);
  });

  it("resolveLocalImport resolves the @/* tsconfig alias to its repo-relative path", () => {
    expect(resolveLocalImport("app/fake/page.tsx", "@/lib/server/supabase/service-role-client")).toBe(
      SERVICE_ROLE_CLIENT_PATH,
    );
  });

  it("reaches() detects a fabricated 4-hop path: \"use client\" component -> intermediate -> repository -> service-role-client.ts", () => {
    const fakeGraph = new Map<string, string[]>([
      ["components/FakeClient.tsx", ["lib/fake/intermediate.ts"]],
      ["lib/fake/intermediate.ts", [RESOLUTION_REPOSITORY_PATH]],
      [RESOLUTION_REPOSITORY_PATH, [SERVICE_ROLE_CLIENT_PATH]],
      [SERVICE_ROLE_CLIENT_PATH, []],
    ]);
    expect(reaches(fakeGraph, "components/FakeClient.tsx", SERVICE_ROLE_CLIENT_PATH)).toBe(true);
  });

  it("reaches() does not falsely report reachability through an unrelated fabricated graph", () => {
    const fakeGraph = new Map<string, string[]>([
      ["components/FakeClient.tsx", ["lib/fake/intermediate.ts"]],
      ["lib/fake/intermediate.ts", ["lib/fake/unrelated.ts"]],
      ["lib/fake/unrelated.ts", []],
    ]);
    expect(reaches(fakeGraph, "components/FakeClient.tsx", SERVICE_ROLE_CLIENT_PATH)).toBe(false);
  });

  it("reaches() terminates (does not infinite-loop) on a cyclic fabricated graph and correctly reports non-reachability", () => {
    const fakeGraph = new Map<string, string[]>([
      ["a.ts", ["b.ts"]],
      ["b.ts", ["a.ts"]],
    ]);
    expect(() => reaches(fakeGraph, "a.ts", SERVICE_ROLE_CLIENT_PATH)).not.toThrow();
    expect(reaches(fakeGraph, "a.ts", SERVICE_ROLE_CLIENT_PATH)).toBe(false);
  });

  it("reaches() terminates and reports reachability on a cycle that does include the target", () => {
    const fakeGraph = new Map<string, string[]>([
      ["a.ts", ["b.ts"]],
      ["b.ts", ["a.ts", SERVICE_ROLE_CLIENT_PATH]],
      [SERVICE_ROLE_CLIENT_PATH, []],
    ]);
    expect(() => reaches(fakeGraph, "a.ts", SERVICE_ROLE_CLIENT_PATH)).not.toThrow();
    expect(reaches(fakeGraph, "a.ts", SERVICE_ROLE_CLIENT_PATH)).toBe(true);
  });
});
