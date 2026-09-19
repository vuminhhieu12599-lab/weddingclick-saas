import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security review for Task 026 Phase 3 (staff issue/rotate/revoke
 * HTTP API), covering the checklist in the Phase 3 authoring instructions
 * §17. Distinct from lib/server/access-links/__tests__/static-security-review.test.ts
 * (Phase 1, reviews the frozen migration 0025 SQL text), which this phase
 * does not touch, and from token-resolution-static-security-review.test.ts
 * (Phase 2, reviews the service_role-backed resolution module), whose
 * production code this phase never touches — but whose route-path guard
 * test Phase 3 independent review (Finding C) did narrowly and
 * intentionally exempt for the three now-frozen Phase 3 staff mutation
 * routes; see that file's own "no HTTP route added (§18)" describe block
 * for the exact, minimal exemption.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const PHASE_3_PRODUCTION_FILES = [
  "lib/server/access-links/access-link-staff-types.ts",
  "lib/server/access-links/access-link-staff-gateway.ts",
  "lib/server/access-links/validate-issue-access-link-input.ts",
  "lib/server/access-links/issue-access-link.ts",
  "lib/server/access-links/rotate-access-link.ts",
  "lib/server/access-links/revoke-access-link.ts",
  "lib/server/supabase/access-link-staff-repository.ts",
  "lib/server/routes/access-links.ts",
  "app/api/v2/internal/projects/[id]/access-links/route.ts",
  "app/api/v2/internal/projects/[id]/access-links/[linkId]/rotate/route.ts",
  "app/api/v2/internal/projects/[id]/access-links/[linkId]/revoke/route.ts",
];

const REPOSITORY_PATH = "lib/server/supabase/access-link-staff-repository.ts";
const ISSUE_USE_CASE_PATH = "lib/server/access-links/issue-access-link.ts";
const ROUTE_MODULE_PATH = "lib/server/routes/access-links.ts";
const ISSUE_VALIDATOR_PATH = "lib/server/access-links/validate-issue-access-link-input.ts";

const SKIP_DIR_NAMES = new Set(["node_modules", ".next", ".git", "__tests__"]);

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
 * Scoped to actual import statements/real usage (mirrors the precise
 * IMPORT_PATTERN approach in token-resolution-static-security-review.test.ts)
 * — deliberately does NOT ban the words "service_role"/
 * "access-link-resolution-repository" from appearing anywhere in a file,
 * since explanatory doc comments in these Phase 3 files legitimately name
 * both to document the isolation boundary (exactly as Phase 2's own
 * repository comments do for service_role). Banning the word itself would
 * either produce false positives or discourage writing that documentation.
 */
const SERVICE_ROLE_IMPORT_PATTERN = /from\s+["'][^"']*service-role-client["']/;
const SERVICE_ROLE_USAGE_PATTERN =
  /createServiceRoleSupabaseClient\(|process\.env\.SUPABASE_SERVICE_ROLE_KEY/;
const RESOLUTION_REPOSITORY_IMPORT_PATTERN =
  /from\s+["'][^"']*access-link-resolution-repository["']/;

describe("Task 026 Phase 3 — service_role isolation", () => {
  it.each(PHASE_3_PRODUCTION_FILES)("%s never imports service-role-client.ts", (file) => {
    expect(readFile(file)).not.toMatch(SERVICE_ROLE_IMPORT_PATTERN);
  });

  it.each(PHASE_3_PRODUCTION_FILES)("%s never calls/reads the service_role client or key", (file) => {
    expect(readFile(file)).not.toMatch(SERVICE_ROLE_USAGE_PATTERN);
  });

  it.each(PHASE_3_PRODUCTION_FILES)(
    "%s never imports the Phase 2 access-link-resolution-repository",
    (file) => {
      expect(readFile(file)).not.toMatch(RESOLUTION_REPOSITORY_IMPORT_PATTERN);
    },
  );
});

describe("Task 026 Phase 3 — no direct REVIEW insert path", () => {
  it("issueDirectAccessLink is only invoked from the non-REVIEW branch of issue-access-link.ts", () => {
    const contents = readFile(ISSUE_USE_CASE_PATH);
    const reviewBranchEnd = contents.indexOf("return { record, token: generated.rawToken };");
    const reviewBranch = contents.slice(0, reviewBranchEnd);
    expect(reviewBranch).toMatch(/issueReviewLink/);
    expect(reviewBranch).not.toMatch(/issueDirectAccessLink/);
  });

  it("the repository's issueDirectAccessLink never sends link_type = 'REVIEW' as a literal", () => {
    const contents = readFile(REPOSITORY_PATH);
    const insertSection = contents.slice(
      contents.indexOf("async issueDirectAccessLink"),
      contents.indexOf("async issueReviewLink"),
    );
    expect(insertSection).not.toMatch(/'REVIEW'/);
  });

  it("no Phase 3 production file performs a raw insert with link_type: 'REVIEW'", () => {
    for (const file of PHASE_3_PRODUCTION_FILES) {
      expect(readFile(file)).not.toMatch(/link_type:\s*["']REVIEW["']/);
    }
  });
});

describe("Task 026 Phase 3 — no direct UPDATE/DELETE of protected columns", () => {
  it("the repository never calls .update(...) on project_access_links", () => {
    expect(readFile(REPOSITORY_PATH)).not.toMatch(/\.update\(/);
  });

  it("the repository never calls .delete(...)", () => {
    expect(readFile(REPOSITORY_PATH)).not.toMatch(/\.delete\(/);
  });

  it("the INSERT payload sends exactly the six D12 issuance columns — never id/created_at/revoked_at/last_used_at/token_hash-as-raw-bytes", () => {
    const contents = readFile(REPOSITORY_PATH);
    const insertPayloadStart = contents.indexOf(".insert({");
    const insertPayloadEnd = contents.indexOf("})", insertPayloadStart);
    const insertPayload = contents.slice(insertPayloadStart, insertPayloadEnd);
    const keys = [...insertPayload.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
    expect(keys.sort()).toEqual(
      ["project_id", "link_type", "token_hash", "token_hint", "expires_at", "created_by"].sort(),
    );
  });

  it("only one .insert( call exists in the whole repository (INTAKE/PORTAL only)", () => {
    const matches = readFile(REPOSITORY_PATH).match(/\.insert\(/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe("Task 026 Phase 3 — no application-layer activity logging", () => {
  it.each(PHASE_3_PRODUCTION_FILES)("%s never calls log_activity", (file) => {
    expect(readFile(file)).not.toMatch(/log_activity/);
  });

  it.each(PHASE_3_PRODUCTION_FILES)("%s never references the activity_logs table", (file) => {
    expect(readFile(file)).not.toMatch(/activity_logs/);
  });
});

describe("Task 026 Phase 3 — caller input surface", () => {
  it("the issue validator accepts exactly linkType/expiresAt, nothing else", () => {
    const contents = readFile(ISSUE_VALIDATOR_PATH);
    const acceptedMatch = contents.match(/ACCEPTED_FIELDS = new Set\(\[([^\]]*)\]\)/);
    expect(acceptedMatch).not.toBeNull();
    const fields = acceptedMatch![1]
      .split(",")
      .map((f) => f.trim().replace(/["']/g, ""))
      .filter((f) => f.length > 0);
    expect(fields.sort()).toEqual(["linkType", "expiresAt"].sort());
  });

  it.each(["token", "rawToken", "tokenHash", "tokenHint", "createdBy"])(
    "the issue validator's accepted-field set never includes %s",
    (forbidden) => {
      const contents = readFile(ISSUE_VALIDATOR_PATH);
      const acceptedMatch = contents.match(/ACCEPTED_FIELDS = new Set\(\[([^\]]*)\]\)/);
      expect(acceptedMatch![1]).not.toContain(`"${forbidden}"`);
    },
  );
});

describe("Task 026 Phase 3 — created_by provenance", () => {
  it("issue-access-link.ts sources createdBy from staff.userId, never from request input", () => {
    const contents = readFile(ISSUE_USE_CASE_PATH);
    expect(contents).toMatch(/createdBy:\s*staff\.userId/);
    expect(contents).not.toMatch(/createdBy:\s*input\./);
    expect(contents).not.toMatch(/createdBy:\s*rawBody/);
  });
});

describe("Task 026 Phase 3 — raw token generation and exposure boundary", () => {
  it("only issue-access-link.ts and rotate-access-link.ts call generateAccessToken", () => {
    const callers = PHASE_3_PRODUCTION_FILES.filter((f) =>
      /generateAccessToken\(\)/.test(readFile(f)),
    );
    expect(callers.sort()).toEqual(
      [ISSUE_USE_CASE_PATH, "lib/server/access-links/rotate-access-link.ts"].sort(),
    );
  });

  it("the repository and route module never call generateAccessToken directly (token is generated in the use case only)", () => {
    expect(readFile(REPOSITORY_PATH)).not.toMatch(/generateAccessToken/);
    expect(readFile(ROUTE_MODULE_PATH)).not.toMatch(/generateAccessToken/);
  });

  it("the repository never has a field literally named token or rawToken in its type surface", () => {
    const contents = readFile(REPOSITORY_PATH);
    expect(contents).not.toMatch(/\brawToken\b/);
  });

  it("the route module only places `token` into the response body construction for issue/rotate, never for revoke", () => {
    const contents = readFile(ROUTE_MODULE_PATH);
    const revokeSection = contents.slice(contents.indexOf("handleRevokeAccessLinkRequest"));
    expect(revokeSection).not.toMatch(/token:\s*result/);
  });
});

describe("Task 026 Phase 3 — Cache-Control: no-store", () => {
  const contents = readFile(ROUTE_MODULE_PATH);

  it("defines a shared no-store header constant", () => {
    expect(contents).toMatch(/Cache-Control["']?\s*:\s*["']no-store["']/);
  });

  it("handleIssueAccessLinkRequest wraps every return path with withNoStore", () => {
    const section = contents.slice(
      contents.indexOf("export async function handleIssueAccessLinkRequest"),
      contents.indexOf("export async function handleRotateAccessLinkRequest"),
    );
    const returns = section.match(/return /g) ?? [];
    const withNoStoreReturns = section.match(/return withNoStore/g) ?? [];
    expect(withNoStoreReturns.length).toBe(returns.length);
  });

  it("handleRotateAccessLinkRequest wraps every return path with withNoStore", () => {
    const section = contents.slice(
      contents.indexOf("export async function handleRotateAccessLinkRequest"),
      contents.indexOf("export async function handleRevokeAccessLinkRequest"),
    );
    const returns = section.match(/return /g) ?? [];
    const withNoStoreReturns = section.match(/return withNoStore/g) ?? [];
    expect(withNoStoreReturns.length).toBe(returns.length);
  });
});

describe("Task 026 Phase 3 — route surface", () => {
  it("creates exactly three new app/api route files under access-links", () => {
    const apiFiles = listProductionTsFiles("app/api/v2/internal/projects/[id]/access-links");
    expect(apiFiles.sort()).toEqual(
      [
        "app/api/v2/internal/projects/[id]/access-links/route.ts",
        "app/api/v2/internal/projects/[id]/access-links/[linkId]/rotate/route.ts",
        "app/api/v2/internal/projects/[id]/access-links/[linkId]/revoke/route.ts",
      ].sort(),
    );
  });

  it("no public/customer route exists anywhere under app/api referencing access-link staff mutation", () => {
    const allApiFiles = listProductionTsFiles("app/api");
    const staffFiles = new Set(
      PHASE_3_PRODUCTION_FILES.filter((f) => f.startsWith("app/api")),
    );
    for (const file of allApiFiles) {
      if (staffFiles.has(file)) {
        continue;
      }
      expect(readFile(file)).not.toMatch(/issueAccessLink|rotateAccessLink|revokeAccessLink/);
    }
  });

  it("every new app/api route file is under /internal/, never a public path", () => {
    for (const file of PHASE_3_PRODUCTION_FILES.filter((f) => f.startsWith("app/api"))) {
      expect(file).toContain("/internal/");
    }
  });
});

describe("Task 026 Phase 3 — rotate/revoke read no request body (frozen no-body contract)", () => {
  const rotateRoutePath =
    "app/api/v2/internal/projects/[id]/access-links/[linkId]/rotate/route.ts";
  const revokeRoutePath =
    "app/api/v2/internal/projects/[id]/access-links/[linkId]/revoke/route.ts";

  it.each([rotateRoutePath, revokeRoutePath])(
    "%s never calls request.json( or request.text(",
    (file) => {
      const contents = readFile(file);
      expect(contents).not.toMatch(/request\.json\(/);
      expect(contents).not.toMatch(/request\.text\(/);
    },
  );

  it("the shared route module's rotate/revoke handlers accept no raw-body parameter", () => {
    const contents = readFile(ROUTE_MODULE_PATH);
    const rotateSignature = contents.slice(
      contents.indexOf("export async function handleRotateAccessLinkRequest"),
      contents.indexOf(
        ">",
        contents.indexOf("export async function handleRotateAccessLinkRequest"),
      ) + 1,
    );
    const revokeSignature = contents.slice(
      contents.indexOf("export async function handleRevokeAccessLinkRequest"),
      contents.indexOf(
        ">",
        contents.indexOf("export async function handleRevokeAccessLinkRequest"),
      ) + 1,
    );
    expect(rotateSignature).not.toMatch(/rawBody/i);
    expect(revokeSignature).not.toMatch(/rawBody/i);
  });

  it("no validate-empty-body production module remains", () => {
    const empty = listProductionTsFiles("lib/server/access-links").filter((f) =>
      f.includes("validate-empty-body"),
    );
    expect(empty).toEqual([]);
  });

  it("no validate-empty-body test remains", () => {
    const testDir = join(ROOT, "lib", "server", "access-links", "__tests__");
    const files = readdirSync(testDir);
    expect(files).not.toContain("validate-empty-body.test.ts");
  });

  it("no Phase 3 production file imports or calls validateEmptyBody", () => {
    for (const file of PHASE_3_PRODUCTION_FILES) {
      expect(readFile(file)).not.toMatch(/validateEmptyBody/);
    }
  });
});

describe("Task 026 Phase 3 — no guest token table touched", () => {
  it.each(PHASE_3_PRODUCTION_FILES)("%s never references a guests table or guest token columns", (file) => {
    const contents = readFile(file);
    expect(contents).not.toMatch(/["']guests["']/);
    expect(contents).not.toMatch(/guests\.token_hash/);
    expect(contents).not.toMatch(/guests\.token_hint/);
  });
});

describe("Task 026 Phase 3 — migration 0025 untouched", () => {
  it("migration 0025 still declares exactly three functions (no Phase 3 addition)", () => {
    const migrationPath = join(
      ROOT,
      "supabase",
      "migrations",
      "20260911041145_0025_access_link_actions.sql",
    );
    const contents = readFileSync(migrationPath, "utf8");
    const matches = contents.match(/CREATE FUNCTION public\./g) ?? [];
    expect(matches.length).toBe(3);
  });

  // Deliberately does NOT assert "0025 is the newest migration in the
  // repository," and deliberately does NOT scan every migration filename
  // for the substring "access_link" (Task 027 Phase 1 Independent Review,
  // Patch 1 Finding B and Patch 2 Finding E): both were Task-026-scope
  // guards that accidentally reached into filenames future tasks own.
  // Patch 1's replacement still banned any later task from ever naming a
  // migration containing "access_link" (e.g. a legitimate future
  // 0035_access_link_rate_limit.sql) — this test must assert only
  // historical facts Task 026 itself owns, never constrain a later task's
  // migration naming. The one fact this test actually needs to keep
  // guaranteeing: Task 026 owns migration slot 0025, and that slot is
  // exactly the one file below (no Phase 3 addition, no future task ever
  // reusing or duplicating the 0025 slot).
  it("Task 026 owns exactly migration slot 0025: 20260911041145_0025_access_link_actions.sql", () => {
    const migrationsDir = join(ROOT, "supabase", "migrations");
    const files = readdirSync(migrationsDir);
    const task026Slot = files.filter((f) => f.includes("_0025_"));
    expect(task026Slot).toEqual(["20260911041145_0025_access_link_actions.sql"]);
  });
});
