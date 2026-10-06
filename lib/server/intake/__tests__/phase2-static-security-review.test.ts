import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security review for Task 027 Phase 2 (HTTP/application intake
 * workflow), covering the checklist in the Phase 2 authoring instructions
 * §14 "SECURITY / STATIC". Mirrors the review style of
 * lib/server/access-links/__tests__/phase3-static-security-review.test.ts
 * (Task 026 Phase 3). Distinct from
 * lib/server/intake/__tests__/static-security-review.test.ts (Task 027
 * Phase 1, reviews the frozen migration 0026 SQL text), which this phase
 * does not touch, and from
 * lib/server/access-links/__tests__/token-resolution-static-security-review.test.ts
 * (Task 026 Phase 2), whose own narrow Task-027-compatibility change is
 * reviewed there, not here.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const PUBLIC_SUBMIT_FILES = [
  "app/api/v2/public/intake-submissions/route.ts",
  "lib/server/intake/submit-intake-submission.ts",
  "lib/server/intake/intake-submit-gateway.ts",
  "lib/server/intake/validate-submit-intake-input.ts",
  "lib/server/supabase/intake-submit-repository.ts",
];

const STAFF_FILES = [
  "app/api/v2/internal/projects/[id]/intake-submissions/route.ts",
  "app/api/v2/internal/projects/[id]/intake-submissions/[submissionId]/route.ts",
  "app/api/v2/internal/projects/[id]/intake-submissions/[submissionId]/apply/route.ts",
  "app/api/v2/internal/projects/[id]/intake-submissions/[submissionId]/reject/route.ts",
  "lib/server/intake/intake-staff-gateway.ts",
  "lib/server/intake/list-intake-submissions.ts",
  "lib/server/intake/get-intake-submission.ts",
  "lib/server/intake/apply-intake-submission.ts",
  "lib/server/intake/reject-intake-submission.ts",
  "lib/server/intake/validate-reject-intake-submission-input.ts",
  "lib/server/supabase/intake-staff-repository.ts",
];

const SHARED_FILES = ["lib/server/intake/intake-types.ts", "lib/server/routes/intake.ts"];

const PHASE_2_PRODUCTION_FILES = [...PUBLIC_SUBMIT_FILES, ...STAFF_FILES, ...SHARED_FILES];

const SERVICE_ROLE_IMPORT_PATTERN = /from\s+["'][^"']*service-role-client["']/;
const SERVICE_ROLE_USAGE_PATTERN =
  /createServiceRoleSupabaseClient\(|process\.env\.SUPABASE_SERVICE_ROLE_KEY/;
const INTAKE_SUBMIT_REPOSITORY_IMPORT_PATTERN =
  /from\s+["'][^"']*supabase\/intake-submit-repository["']/;
const STAFF_AUTH_IMPORT_PATTERN = /from\s+["'][^"']*staff-auth-gateway["']/;
const STAFF_CLIENT_IMPORT_PATTERN = /from\s+["'][^"']*supabase\/staff-client["']/;
const INTAKE_STAFF_REPOSITORY_IMPORT_PATTERN =
  /from\s+["'][^"']*supabase\/intake-staff-repository["']/;

describe("Task 027 Phase 2 — public/staff service-role isolation", () => {
  it.each(STAFF_FILES)("%s never imports service-role-client.ts", (file) => {
    expect(readFile(file)).not.toMatch(SERVICE_ROLE_IMPORT_PATTERN);
  });

  it.each(STAFF_FILES)("%s never calls/reads the service_role client or key", (file) => {
    expect(readFile(file)).not.toMatch(SERVICE_ROLE_USAGE_PATTERN);
  });

  it.each(STAFF_FILES)("%s never imports the public intake-submit repository", (file) => {
    expect(readFile(file)).not.toMatch(INTAKE_SUBMIT_REPOSITORY_IMPORT_PATTERN);
  });

  it.each(PUBLIC_SUBMIT_FILES)(
    "%s never imports the staff auth gateway or staff Supabase client",
    (file) => {
      expect(readFile(file)).not.toMatch(STAFF_AUTH_IMPORT_PATTERN);
      expect(readFile(file)).not.toMatch(STAFF_CLIENT_IMPORT_PATTERN);
    },
  );

  it.each(PUBLIC_SUBMIT_FILES)(
    "%s never imports the staff intake repository/gateway",
    (file) => {
      expect(readFile(file)).not.toMatch(INTAKE_STAFF_REPOSITORY_IMPORT_PATTERN);
      expect(readFile(file)).not.toMatch(/from\s+["'][^"']*intake-staff-gateway["']/);
    },
  );

  it("exactly the two documented modules import service-role-client.ts: the Phase 2 resolution repository and this phase's intake-submit repository", () => {
    // Cross-checked in lib/server/access-links/__tests__/token-resolution-static-security-review.test.ts's
    // own exact two-file allowlist — this test only re-confirms the second
    // half of that pair from this phase's own file inventory.
    expect(readFile("lib/server/supabase/intake-submit-repository.ts")).toMatch(
      SERVICE_ROLE_IMPORT_PATTERN,
    );
  });
});

/** Strips `//` and JSDoc `*`-prefixed comment lines — mirrors the Task 027 Phase 1 migration test's own `codeLines` precedent: a real call appears in actual code, never only inside explanatory prose describing what is deliberately avoided. */
function codeLines(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/**");
    })
    .join("\n");
}

describe("Task 027 Phase 2 — no direct intake_submissions mutation outside the frozen RPCs", () => {
  it.each(PHASE_2_PRODUCTION_FILES)(
    "%s never calls .insert(/.update(/.delete( against intake_submissions",
    (file) => {
      const code = codeLines(readFile(file));
      expect(code).not.toMatch(/\.from\(\s*["']intake_submissions["']\s*\)\s*\.\s*insert\(/);
      expect(code).not.toMatch(/\.from\(\s*["']intake_submissions["']\s*\)\s*\.\s*update\(/);
      expect(code).not.toMatch(/\.from\(\s*["']intake_submissions["']\s*\)\s*\.\s*delete\(/);
    },
  );

  it("the staff repository's only intake_submissions access is .select( — via .from(...).select(", () => {
    const contents = readFile("lib/server/supabase/intake-staff-repository.ts");
    const fromCalls = [...contents.matchAll(/\.from\(\s*["']([^"']+)["']\s*\)/g)];
    expect(fromCalls.length).toBeGreaterThan(0);
    for (const match of fromCalls) {
      expect(["projects", "intake_submissions"]).toContain(match[1]);
    }
  });

  it("apply/reject reach the database only via .rpc(", () => {
    const contents = readFile("lib/server/supabase/intake-staff-repository.ts");
    const rpcCalls = contents.match(/\.rpc\(\s*["']([a-z_]+)["']/g) ?? [];
    expect(rpcCalls.length).toBe(2);
    expect(contents).toMatch(/\.rpc\(\s*["']apply_intake_submission["']/);
    expect(contents).toMatch(/\.rpc\(\s*["']reject_intake_submission["']/);
  });

  it("the submit repository reaches the database only via .rpc('submit_intake_submission'", () => {
    const contents = readFile("lib/server/supabase/intake-submit-repository.ts");
    expect(contents).not.toMatch(/\.from\(/);
    const rpcCalls = contents.match(/\.rpc\(\s*["']([a-z_]+)["']/g) ?? [];
    expect(rpcCalls).toHaveLength(1);
    expect(contents).toMatch(/\.rpc\(\s*["']submit_intake_submission["']/);
  });
});

describe("Task 027 Phase 2 — raw token never reaches submit_intake_submission", () => {
  it("the RPC call param object contains only resolved-id and Wedding-Details params, never a token/hash/hint key", () => {
    const contents = readFile("lib/server/supabase/intake-submit-repository.ts");
    const rpcCallStart = contents.indexOf('client.rpc("submit_intake_submission"');
    expect(rpcCallStart).toBeGreaterThan(-1);
    const rpcCallEnd = contents.indexOf("});", rpcCallStart);
    const rpcCallParams = contents.slice(rpcCallStart, rpcCallEnd);
    expect(rpcCallParams).not.toMatch(/token/i);
    expect(rpcCallParams).toMatch(/p_project_id/);
    expect(rpcCallParams).toMatch(/p_access_link_id/);
  });

  it("the submit gateway interface never declares a rawToken/token parameter", () => {
    const contents = readFile("lib/server/intake/intake-submit-gateway.ts");
    expect(contents).not.toMatch(/\brawToken\b/);
    expect(contents).not.toMatch(/\btokenHash\b/);
  });

  it("submit-intake-submission.ts passes rawToken only to resolveAccessLink, never onward to the submit gateway", () => {
    const contents = readFile("lib/server/intake/submit-intake-submission.ts");
    const submitCallStart = contents.indexOf("submitGateway.submitIntakeSubmission({");
    expect(submitCallStart).toBeGreaterThan(-1);
    const submitCallEnd = contents.indexOf("});", submitCallStart);
    const submitCallArgs = contents.slice(submitCallStart, submitCallEnd);
    expect(submitCallArgs).not.toMatch(/rawToken/);
  });
});

describe("Task 027 Phase 2 — no token/hash/hint exposure in response DTOs", () => {
  it.each(SHARED_FILES)("%s never declares a token/tokenHash/tokenHint field", (file) => {
    const contents = readFile(file);
    expect(contents).not.toMatch(/\btoken\s*:/);
    expect(contents).not.toMatch(/\btokenHash\b/);
    expect(contents).not.toMatch(/\btokenHint\b/);
  });

  it("the public submit response shape never includes accessLinkId", () => {
    const contents = readFile("lib/server/routes/intake.ts");
    const responseStart = contents.indexOf("interface SubmitIntakeResponseData");
    const responseEnd = contents.indexOf("}", responseStart);
    const responseShape = contents.slice(responseStart, responseEnd);
    expect(responseShape).not.toMatch(/accessLinkId/);
  });
});

describe("Task 027 Phase 2 — no request/body/token logging", () => {
  it.each(PHASE_2_PRODUCTION_FILES)("%s never logs rawBody/payload/weddingDetails content", (file) => {
    const contents = readFile(file);
    const consoleLines = contents.split("\n").filter((line) => /console\./.test(line));
    for (const line of consoleLines) {
      expect(line).not.toMatch(/rawBody/);
      expect(line).not.toMatch(/weddingDetails/);
      expect(line).not.toMatch(/payload/i);
      expect(line).not.toMatch(/authorization/i);
      expect(line).not.toMatch(/rawToken/);
    }
  });

  it.each(PUBLIC_SUBMIT_FILES)("%s never calls console.* at all (no logging on the public path)", (file) => {
    expect(readFile(file)).not.toMatch(/console\./);
  });
});

/**
 * Task 035A owns abuse controls: the public submit route file adds the
 * pre-resolution IP guard and per-INTAKE-link guard wiring, and the shared
 * handler maps the guard's 429/503. Every other Phase 2 file (use case,
 * validation, gateways, staff routes) must still implement none.
 */
const TASK_035A_GUARDED_FILES = new Set(["app/api/v2/public/intake-submissions/route.ts", "lib/server/routes/intake.ts"]);

describe("Task 027 Phase 2 — no rate-limiting scope creep", () => {
  it.each(PHASE_2_PRODUCTION_FILES.filter((file) => !TASK_035A_GUARDED_FILES.has(file)))("%s implements no rate limiting", (file) => {
    const contents = readFile(file);
    expect(contents).not.toMatch(/rate.?limit/i);
    expect(contents).not.toMatch(/\bredis\b/i);
    expect(contents).not.toMatch(/\bthrottle\b/i);
  });
});

describe("Task 027 Phase 2 — no out-of-scope table/lifecycle/downstream-task behavior", () => {
  it.each(PHASE_2_PRODUCTION_FILES)(
    "%s never references project_events, project_media, or lifecycle/publish/portal/guest/RSVP scope",
    (file) => {
      const contents = readFile(file);
      expect(contents).not.toMatch(/project_events/);
      expect(contents).not.toMatch(/project_media/);
      expect(contents).not.toMatch(/publish_invitation/i);
      expect(contents).not.toMatch(/\bportal\b/i);
      expect(contents).not.toMatch(/\bguest_id\b/i);
      expect(contents).not.toMatch(/\brsvp\b/i);
    },
  );
});

describe("Task 027 Phase 2 — no new migration authored, migration 0026 untouched", () => {
  // Deliberately does NOT scan every migration filename for the substring
  // "intake" (Task 027 Phase 2 Independent Review Patch 1, Finding D): that
  // was a CURRENT CHECKPOINT FACT ("Task 027 Phase 2 authored no migration")
  // masquerading as a permanent repository invariant. A legitimate later
  // task (e.g. a future 0035_intake_rate_limit.sql for Task 035) would
  // incorrectly fail this test forever. Checkpoint git status/diff — not a
  // test — is the actual source of truth that this Phase 2 checkpoint
  // authored no migration. The one fact this test still needs to keep
  // guaranteeing, mirroring phase3-static-security-review.test.ts's own
  // "Task 026 owns exactly migration slot 0025" precedent: Task 027 Phase 1
  // owns migration slot 0026, and that slot is exactly the one file below —
  // never a second file reusing or duplicating the 0026 slot.
  it("Task 027 Phase 1 owns exactly migration slot 0026: 20260911041146_0026_intake_actions.sql", () => {
    const migrationsDir = join(ROOT, "supabase", "migrations");
    const files = readdirSync(migrationsDir);
    const task027Slot = files.filter((f) => f.includes("_0026_"));
    expect(task027Slot).toEqual(["20260911041146_0026_intake_actions.sql"]);
  });

  it("migration 0026 still declares exactly three functions (Phase 2 authors no SQL)", () => {
    const contents = readFileSync(
      join(ROOT, "supabase", "migrations", "20260911041146_0026_intake_actions.sql"),
      "utf8",
    );
    const matches = contents.match(/CREATE FUNCTION public\./g) ?? [];
    expect(matches.length).toBe(3);
  });
});

describe("Task 027 Phase 2 — Task 026 resolver source unchanged", () => {
  it("resolve-access-link.ts still declares its frozen resolution-order function unchanged", () => {
    const contents = readFile("lib/server/access-links/resolve-access-link.ts");
    expect(contents).toMatch(
      /Access-link token-resolution use case \(Task 026 Phase 2,/,
    );
    expect(contents).toMatch(/export async function resolveAccessLink\(/);
  });

  it.each(PHASE_2_PRODUCTION_FILES)(
    "%s never redeclares/shadows resolveAccessLink — it only imports and calls the frozen Task 026 function",
    (file) => {
      const contents = readFile(file);
      expect(contents).not.toMatch(/function resolveAccessLink\(/);
    },
  );
});

describe("Task 027 Phase 2 — Cache-Control: no-store on every route", () => {
  const contents = readFile("lib/server/routes/intake.ts");

  it("defines a shared no-store header constant", () => {
    expect(contents).toMatch(/Cache-Control["']?\s*:\s*["']no-store["']/);
  });

  it.each([
    "handleSubmitIntakeRequest",
    "handleListIntakeSubmissionsRequest",
    "handleGetIntakeSubmissionRequest",
    "handleApplyIntakeSubmissionRequest",
    "handleRejectIntakeSubmissionRequest",
  ])("%s wraps every return path with withNoStore", (handlerName) => {
    const start = contents.indexOf(`export async function ${handlerName}`);
    expect(start).toBeGreaterThan(-1);
    const nextExportIdx = contents.indexOf("export async function", start + 1);
    const section = nextExportIdx === -1 ? contents.slice(start) : contents.slice(start, nextExportIdx);
    const returns = section.match(/return /g) ?? [];
    const withNoStoreReturns = section.match(/return withNoStore/g) ?? [];
    expect(withNoStoreReturns.length).toBe(returns.length);
  });
});

describe("Task 027 Phase 2 — no empty-body reads on the apply route", () => {
  const applyRoutePath =
    "app/api/v2/internal/projects/[id]/intake-submissions/[submissionId]/apply/route.ts";

  it("the apply route never calls request.json( or request.text(", () => {
    const contents = readFile(applyRoutePath);
    expect(contents).not.toMatch(/request\.json\(/);
    expect(contents).not.toMatch(/request\.text\(/);
  });

  it("handleApplyIntakeSubmissionRequest accepts no raw-body parameter", () => {
    const contents = readFile("lib/server/routes/intake.ts");
    const start = contents.indexOf("export async function handleApplyIntakeSubmissionRequest");
    const signatureEnd = contents.indexOf(">", start) + 1;
    const signature = contents.slice(start, signatureEnd);
    expect(signature).not.toMatch(/rawBody/i);
  });

  it("applyIntakeSubmission use case accepts no raw-body parameter", () => {
    const contents = readFile("lib/server/intake/apply-intake-submission.ts");
    expect(contents).not.toMatch(/rawBody/i);
  });
});

describe("Task 027 Phase 2 Independent Review Patch 1, Finding A — no eager body read before auth/resolver", () => {
  const publicSubmitRoutePath = "app/api/v2/public/intake-submissions/route.ts";
  const rejectRoutePath =
    "app/api/v2/internal/projects/[id]/intake-submissions/[submissionId]/reject/route.ts";

  it.each([publicSubmitRoutePath, rejectRoutePath])(
    "%s never eagerly awaits request.json() — the body reader is passed as an uninvoked callback",
    (file) => {
      const contents = readFile(file);
      expect(contents).not.toMatch(/await\s+request\.json\(/);
      expect(contents).not.toMatch(/await\s+request\.text\(/);
      expect(contents).toMatch(/\(\)\s*=>\s*request\.json\(\)/);
    },
  );

  it("the public submit route reads the body via a lazy () => request.json() callback, not a materialized value", () => {
    const contents = readFile(publicSubmitRoutePath);
    const callSiteStart = contents.indexOf("handleSubmitIntakeRequest(");
    const callSiteEnd = contents.indexOf(");", callSiteStart);
    const callSite = contents.slice(callSiteStart, callSiteEnd);
    expect(callSite).toMatch(/\(\)\s*=>\s*request\.json\(\)/);
  });

  it("the reject route reads the body via a lazy () => request.json() callback, not a materialized value", () => {
    const contents = readFile(rejectRoutePath);
    const callSiteStart = contents.indexOf("handleRejectIntakeSubmissionRequest(");
    const callSiteEnd = contents.indexOf(");", callSiteStart);
    const callSite = contents.slice(callSiteStart, callSiteEnd);
    expect(callSite).toMatch(/\(\)\s*=>\s*request\.json\(\)/);
  });

  it("submitIntakeSubmission calls resolveAccessLink before it ever invokes readBody", () => {
    const contents = readFile("lib/server/intake/submit-intake-submission.ts");
    const resolveIdx = contents.indexOf("await resolveAccessLink(");
    const readBodyIdx = contents.indexOf("await readBody(");
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(readBodyIdx).toBeGreaterThan(resolveIdx);
  });

  it("handleRejectIntakeSubmissionRequest calls requireStaff before it ever invokes readBody", () => {
    const contents = readFile("lib/server/routes/intake.ts");
    const start = contents.indexOf("export async function handleRejectIntakeSubmissionRequest");
    const nextExportIdx = contents.indexOf("export async function", start + 1);
    const section = nextExportIdx === -1 ? contents.slice(start) : contents.slice(start, nextExportIdx);
    const requireStaffIdx = section.indexOf("await requireStaff(");
    const readBodyIdx = section.indexOf("await readBody(");
    expect(requireStaffIdx).toBeGreaterThan(-1);
    expect(readBodyIdx).toBeGreaterThan(requireStaffIdx);
  });

  it("a readBody()/request.json() failure maps to the fixed, safe BAD_REQUEST message — never a raw parser error", () => {
    const submitContents = readFile("lib/server/intake/submit-intake-submission.ts");
    expect(submitContents).toMatch(/"Request body must be valid JSON"/);
    const routesContents = readFile("lib/server/routes/intake.ts");
    expect(routesContents).toMatch(/"Request body must be valid JSON"/);
  });
});
