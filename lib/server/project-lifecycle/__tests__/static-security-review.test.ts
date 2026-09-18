import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security + structural review for Task 025 Authoring Phase 1
 * (migration 0024_project_lifecycle_payment_assignment.sql). No Next.js
 * routes/handlers/use-cases/validators/gateway exist yet (Phase 1 scope,
 * per this migration's own "AUTHORING ONLY" header) — this migration and
 * the PLxxx error-code map (reviewed separately in
 * project-lifecycle-rpc-error-codes.test.ts) are the only Task 025
 * artifacts to review at this checkpoint. The frozen business rules these
 * tests assert against are recorded in docs/DECISIONS.md "Task 025 —
 * Project Lifecycle / Payment / Assignment".
 *
 * Since the migration is authored-only and not applied (see its own
 * "AUTHORING ONLY — not applied" header), the required DB tests are
 * implemented here as structural assertions against the actual migration
 * SQL text, mirroring the review style of
 * lib/server/project-events/__tests__/static-security-review.test.ts
 * (Task 023): read the actual migration text and assert on it directly,
 * never assume its contents or hand-duplicate the transition graph.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const MIGRATION_FILENAME = "20260911041144_0024_project_lifecycle_payment_assignment.sql";
const MIGRATION_PATH = join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const FILES_UNDER_REVIEW = ["lib/server/project-lifecycle/project-lifecycle-rpc-error-codes.ts"];

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

/** Slices out one `CREATE FUNCTION public.<fnName>(...) ... $$;` body. */
function extractFunctionBody(contents: string, fnName: string): string {
  const start = contents.indexOf(`CREATE FUNCTION public.${fnName}(`);
  expect(start).toBeGreaterThan(-1);
  const end = contents.indexOf(`REVOKE ALL ON FUNCTION public.${fnName}(`, start);
  expect(end).toBeGreaterThan(start);
  return contents.slice(start, end);
}

/** Slices out the "-- A. Caller" section of a function body, up to the next "-- B." marker. */
function extractCallerAuthSection(fnBody: string): string {
  const start = fnBody.indexOf("-- A. Caller");
  expect(start).toBeGreaterThan(-1);
  const end = fnBody.indexOf("-- B.", start);
  expect(end).toBeGreaterThan(start);
  return fnBody.slice(start, end);
}

type Edge = [string, string];

/** Parses the exact ('FROM', 'TO') pairs out of the transition_project_status VALUES list. */
function extractAllowedEdges(fnBody: string): Edge[] {
  const start = fnBody.indexOf("FROM (VALUES");
  expect(start).toBeGreaterThan(-1);
  const end = fnBody.indexOf(") AS allowed_edges(from_status, to_status)", start);
  expect(end).toBeGreaterThan(start);
  const block = fnBody.slice(start, end);
  const pairs = [...block.matchAll(/\(\s*'([A-Z_]+)'\s*,\s*'([A-Z_]+)'\s*\)/g)];
  return pairs.map((m) => [m[1], m[2]] as Edge);
}

const FROZEN_EDGES: Edge[] = [
  ["NEW", "WAITING_FOR_INFO"],
  ["WAITING_FOR_INFO", "IN_PROGRESS"],
  ["IN_PROGRESS", "INTERNAL_REVIEW"],
  ["INTERNAL_REVIEW", "IN_PROGRESS"],
  ["REVISION_REQUIRED", "IN_PROGRESS"],
  ["APPROVED", "AWAITING_PAYMENT"],
  ["AWAITING_PAYMENT", "READY_TO_PUBLISH"],
  ["PUBLISHED", "COMPLETED"],
  ["COMPLETED", "ARCHIVED"],
];

const RESERVED_TARGETS = ["CUSTOMER_REVIEW", "REVISION_REQUIRED", "APPROVED", "PUBLISHED"];

const ALL_12_STATUSES = [
  "NEW",
  "WAITING_FOR_INFO",
  "IN_PROGRESS",
  "INTERNAL_REVIEW",
  "CUSTOMER_REVIEW",
  "REVISION_REQUIRED",
  "APPROVED",
  "AWAITING_PAYMENT",
  "READY_TO_PUBLISH",
  "PUBLISHED",
  "COMPLETED",
  "ARCHIVED",
];

describe("Task 025 Phase 1 — migration file placement", () => {
  it("0024_project_lifecycle_payment_assignment.sql exists and sorts immediately after 0023", () => {
    const files = readdirSync(MIGRATIONS_DIR).sort();
    expect(files).toContain(MIGRATION_FILENAME);
    const idx0023 = files.findIndex((f) => f.includes("0023_project_media_storage"));
    const idx0024 = files.indexOf(MIGRATION_FILENAME);
    expect(idx0023).toBeGreaterThan(-1);
    expect(idx0024).toBe(idx0023 + 1);
  });
});

describe("Task 025 Phase 1 — no scope creep", () => {
  const contents = readMigration();

  it("creates exactly three functions", () => {
    const matches = contents.match(/CREATE FUNCTION public\./g) ?? [];
    expect(matches.length).toBe(3);
    expect(contents).toMatch(/CREATE FUNCTION public\.transition_project_status\(/);
    expect(contents).toMatch(/CREATE FUNCTION public\.mark_project_paid\(/);
    expect(contents).toMatch(/CREATE FUNCTION public\.reassign_project_staff\(/);
  });

  // SQL statements in this codebase's migrations always start at column 0;
  // comments always start with "--" at column 0. Line-anchored patterns
  // below therefore only match real DDL, never prose mentioning the same
  // keywords (this migration's own header comments legitimately discuss
  // "CREATE TABLE"/"ALTER POLICY"/etc. as things it does NOT do).
  it("never creates, alters, or drops a table", () => {
    expect(contents).not.toMatch(/^CREATE TABLE/m);
    expect(contents).not.toMatch(/^ALTER TABLE/m);
    expect(contents).not.toMatch(/^DROP TABLE/m);
  });

  it("never creates, alters, or drops an RLS policy on public.projects (or anywhere)", () => {
    expect(contents).not.toMatch(/^CREATE POLICY/m);
    expect(contents).not.toMatch(/^ALTER POLICY/m);
    expect(contents).not.toMatch(/^DROP POLICY/m);
  });

  it("never redefines or drops the existing commercial-freeze trigger/function (0005/0006)", () => {
    expect(contents).not.toMatch(/^CREATE (OR REPLACE )?FUNCTION public\.guard_project_commercial_freeze/m);
    expect(contents).not.toMatch(/^CREATE (OR REPLACE )?FUNCTION public\.guard_project_addon_commercial_freeze/m);
    expect(contents).not.toMatch(/^DROP TRIGGER/m);
    expect(contents).not.toMatch(/^DROP FUNCTION/m);
  });

  it("never grants anything to service_role (REVOKE FROM service_role is expected and present)", () => {
    expect(contents).not.toMatch(/GRANT[^;]*TO service_role/);
  });

  it("never mutates project_tasks or activity_logs table shape", () => {
    expect(contents).not.toMatch(/ALTER TABLE public\.project_tasks/);
    expect(contents).not.toMatch(/ALTER TABLE public\.activity_logs/);
  });

  it("mentions assigned_staff_id only for the projects column/grant/assignment logic, never inside an RLS/policy context", () => {
    // No CREATE POLICY exists at all in this file (asserted above), so any
    // occurrence of assigned_staff_id here is necessarily outside RLS.
    expect(contents).toMatch(/assigned_staff_id/);
    expect(contents).not.toMatch(/CREATE POLICY[^;]*assigned_staff_id/);
  });
});

describe("Task 025 Phase 1 — transition_project_status: frozen edge graph", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "transition_project_status");
  const edges = extractAllowedEdges(fnBody);

  it("contains exactly the 9 frozen edges, no more, no fewer", () => {
    expect(edges).toHaveLength(9);
    const sortedActual = [...edges].sort((a, b) => (a.join("|") < b.join("|") ? -1 : 1));
    const sortedExpected = [...FROZEN_EDGES].sort((a, b) => (a.join("|") < b.join("|") ? -1 : 1));
    expect(sortedActual).toEqual(sortedExpected);
  });

  it.each(RESERVED_TARGETS)("%s never appears as a to_status (reserved-target rule)", (target) => {
    expect(edges.some(([, to]) => to === target)).toBe(false);
  });

  it("ARCHIVED never appears as a from_status (terminal)", () => {
    expect(edges.some(([from]) => from === "ARCHIVED")).toBe(false);
  });

  it("only recognized 12 statuses appear anywhere in the edge list", () => {
    for (const [from, to] of edges) {
      expect(ALL_12_STATUSES).toContain(from);
      expect(ALL_12_STATUSES).toContain(to);
    }
  });

  it("validates p_target_status against the exact 12-value set (PL003) before touching the Project row", () => {
    const validateIdx = fnBody.indexOf("USING ERRCODE = 'PL003'");
    const lockIdx = fnBody.indexOf("FOR UPDATE");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(-1);
    // PL003's guard is textually before the project row is locked, per the
    // migration header's documented ordering rationale.
    const projectLockIdx = fnBody.indexOf("FROM public.projects AS p");
    expect(projectLockIdx).toBeGreaterThan(-1);
    expect(validateIdx).toBeLessThan(projectLockIdx);
  });
});

describe("Task 025 Phase 1 — transition_project_status: NULL target status is rejected via PL003 (Finding 1 patch)", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "transition_project_status");

  /**
   * Slices out the actual `IF p_target_status IS NULL OR p_target_status NOT
   * IN (...) THEN ... END IF;` guard from the real migration text — never a
   * hand-duplicated copy — so these assertions fail if the guard is ever
   * weakened back to a bare `NOT IN` (which SQL three-valued logic would let
   * a NULL target silently bypass, per the migration's PL003 comment).
   */
  function extractNullStatusGuard(): { guardText: string; values: string[]; thenBranch: string } {
    const match = fnBody.match(
      /IF\s+p_target_status\s+IS\s+NULL\s+OR\s+p_target_status\s+NOT\s+IN\s*\(([\s\S]*?)\)\s*THEN([\s\S]*?)\n {2}END IF;/,
    );
    expect(match).not.toBeNull();
    const guardText = match![0];
    const valuesBlock = match![1];
    const thenBranch = match![2];
    const values = [...valuesBlock.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    return { guardText, values, thenBranch };
  }

  it("the guard is `p_target_status IS NULL OR p_target_status NOT IN (...)`, not a bare NOT IN", () => {
    const { guardText } = extractNullStatusGuard();
    expect(guardText).toMatch(/^IF\s+p_target_status\s+IS\s+NULL\s+OR\s+p_target_status\s+NOT\s+IN\s*\(/);
  });

  it("PL003 is raised inside that same guard's THEN branch", () => {
    const { thenBranch } = extractNullStatusGuard();
    expect(thenBranch).toMatch(/RAISE EXCEPTION\s+'Target status is not a recognized project status'\s+USING ERRCODE = 'PL003';/);
  });

  it("there is exactly one PL003 guard in the function (the NULL check was merged into the existing guard, not appended as a second check)", () => {
    const matches = fnBody.match(/USING ERRCODE = 'PL003'/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("the guard's value list is exactly the 12 recognized statuses, unchanged by the patch", () => {
    const { values } = extractNullStatusGuard();
    expect(values).toHaveLength(12);
    expect([...values].sort()).toEqual([...ALL_12_STATUSES].sort());
  });

  it("the NULL/PL003 guard occurs before the target Project row is read or locked", () => {
    const { guardText } = extractNullStatusGuard();
    const guardIdx = fnBody.indexOf(guardText);
    const projectLockIdx = fnBody.indexOf("FROM public.projects AS p");
    const forUpdateAfterLockIdx = fnBody.indexOf("FOR UPDATE", projectLockIdx);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(projectLockIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(projectLockIdx);
    expect(guardIdx).toBeLessThan(forUpdateAfterLockIdx);
  });

  it("the 9 allowed edges and reserved-target rule are unaffected by the NULL guard (still exactly as frozen)", () => {
    const edges = extractAllowedEdges(fnBody);
    expect(edges).toHaveLength(9);
    const sortedActual = [...edges].sort((a, b) => (a.join("|") < b.join("|") ? -1 : 1));
    const sortedExpected = [...FROZEN_EDGES].sort((a, b) => (a.join("|") < b.join("|") ? -1 : 1));
    expect(sortedActual).toEqual(sortedExpected);
    for (const target of RESERVED_TARGETS) {
      expect(edges.some(([, to]) => to === target)).toBe(false);
    }
  });
});

describe("Task 025 Phase 1 — transition_project_status: no-op, invariant, and precondition ordering", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "transition_project_status");

  it("no-op check (PL004) is textually before the edge-legality check (PL005)", () => {
    const noOpIdx = fnBody.indexOf("USING ERRCODE = 'PL004'");
    const edgeIdx = fnBody.indexOf("USING ERRCODE = 'PL005'");
    expect(noOpIdx).toBeGreaterThan(-1);
    expect(edgeIdx).toBeGreaterThan(-1);
    expect(noOpIdx).toBeLessThan(edgeIdx);
  });

  it("READY_TO_PUBLISH payment precondition (PL006) checks payment_status <> 'PAID', scoped to AWAITING_PAYMENT -> READY_TO_PUBLISH only", () => {
    const guard = fnBody.match(
      /IF\s+v_current_status\s*=\s*'AWAITING_PAYMENT'\s*\n\s*AND\s+p_target_status\s*=\s*'READY_TO_PUBLISH'\s*\n\s*AND\s+v_payment_status\s*<>\s*'PAID'\s*\n\s*THEN[\s\S]*?ERRCODE\s*=\s*'PL006'/,
    );
    expect(guard).not.toBeNull();
  });

  it("the payment precondition check is textually after the edge-legality check (edge validity is decided first)", () => {
    const edgeIdx = fnBody.indexOf("USING ERRCODE = 'PL005'");
    const preconditionIdx = fnBody.indexOf("USING ERRCODE = 'PL006'");
    expect(edgeIdx).toBeGreaterThan(-1);
    expect(preconditionIdx).toBeGreaterThan(-1);
    expect(edgeIdx).toBeLessThan(preconditionIdx);
  });

  it("reason is trimmed, whitespace-only becomes NULL, and >2000 chars is rejected (PL010)", () => {
    expect(fnBody).toMatch(/regexp_replace\(p_reason, '\^\\s\+\|\\s\+\$', '', 'g'\)/);
    expect(fnBody).toMatch(/IF\s+v_reason\s*=\s*''\s*THEN\s*\n\s*v_reason\s*:=\s*NULL;/);
    expect(fnBody).toMatch(
      /char_length\(v_reason\)\s*>\s*2000[\s\S]{0,80}ERRCODE\s*=\s*'PL010'/,
    );
  });
});

describe("Task 025 Phase 1 — transition_project_status: timestamps and activity", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "transition_project_status");

  it("sets completed_at = now() only on the COMPLETED branch, otherwise leaves it unchanged", () => {
    expect(fnBody).toMatch(
      /completed_at = CASE WHEN p_target_status = 'COMPLETED' THEN now\(\) ELSE p\.completed_at END/,
    );
  });

  it("sets archived_at = now() only on the ARCHIVED branch, otherwise leaves it unchanged", () => {
    expect(fnBody).toMatch(
      /archived_at = CASE WHEN p_target_status = 'ARCHIVED' THEN now\(\) ELSE p\.archived_at END/,
    );
  });

  it("never clears completed_at or archived_at (no ELSE NULL branch for either)", () => {
    expect(fnBody).not.toMatch(/completed_at = CASE WHEN[^E]*ELSE NULL END/);
    expect(fnBody).not.toMatch(/archived_at = CASE WHEN[^E]*ELSE NULL END/);
  });

  it("logs exactly once per call, choosing PROJECT_ARCHIVED for ARCHIVED and PROJECT_STATUS_CHANGED otherwise — never both", () => {
    const logCalls = fnBody.match(/PERFORM public\.log_activity\(/g) ?? [];
    expect(logCalls).toHaveLength(1);
    expect(fnBody).toMatch(
      /IF\s+p_target_status\s*=\s*'ARCHIVED'\s+THEN\s*\n\s*v_activity_type\s*:=\s*'PROJECT_ARCHIVED';\s*\n\s*ELSE\s*\n\s*v_activity_type\s*:=\s*'PROJECT_STATUS_CHANGED';/,
    );
    expect(fnBody).toMatch(/v_activity_type,\s*\n\s*'Project status changed',/);
  });

  it("metadata includes from_status/to_status always, reason only when non-NULL", () => {
    expect(fnBody).toMatch(/'from_status', v_current_status,\s*\n\s*'to_status', p_target_status,\s*\n\s*'reason', v_reason/);
    expect(fnBody).toMatch(/'from_status', v_current_status,\s*\n\s*'to_status', p_target_status\s*\n\s*\);/);
    expect(fnBody).toMatch(/IF v_reason IS NOT NULL THEN/);
  });

  it("no activity call exists before the mutating UPDATE (activity only follows a real mutation)", () => {
    const updateIdx = fnBody.indexOf("UPDATE public.projects AS p SET");
    const logIdx = fnBody.indexOf("PERFORM public.log_activity(");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeGreaterThan(updateIdx);
  });
});

describe("Task 025 Phase 1 — mark_project_paid", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "mark_project_paid");

  it("checks already-PAID (PL007) before the AWAITING_PAYMENT precondition (PL006) — frozen order", () => {
    const alreadyPaidIdx = fnBody.indexOf("USING ERRCODE = 'PL007'");
    const preconditionIdx = fnBody.indexOf("USING ERRCODE = 'PL006'");
    expect(alreadyPaidIdx).toBeGreaterThan(-1);
    expect(preconditionIdx).toBeGreaterThan(-1);
    expect(alreadyPaidIdx).toBeLessThan(preconditionIdx);
  });

  it("requires status = AWAITING_PAYMENT to succeed", () => {
    expect(fnBody).toMatch(/IF v_current_status <> 'AWAITING_PAYMENT' THEN/);
  });

  it("sets payment_status = PAID and paid_at = now(), and never sets status", () => {
    const updateMatch = fnBody.match(/UPDATE public\.projects AS p SET[\s\S]*?RETURNING p\.\* INTO v_result;/);
    expect(updateMatch).not.toBeNull();
    const updateStmt = updateMatch![0];
    expect(updateStmt).toMatch(/payment_status = 'PAID'/);
    expect(updateStmt).toMatch(/paid_at = now\(\)/);
    expect(updateStmt).not.toMatch(/\bstatus\s*=/);
  });

  it("has no MARK_UNPAID / generic payment setter / reversal path", () => {
    expect(contents).not.toMatch(/CREATE FUNCTION public\.mark_project_unpaid/);
    // p_payment_status would indicate a generic client-settable setter;
    // this function only ever takes the target Project id as input.
    expect(fnBody).not.toMatch(/p_payment_status/);
    // The only 'UNPAID' occurrence in this function is the metadata literal
    // describing the payment's prior state, never a settable parameter.
    const unpaidOccurrences = fnBody.match(/'UNPAID'/g) ?? [];
    expect(unpaidOccurrences.length).toBe(1);
  });

  it("logs exactly one PROJECT_MARKED_PAID activity row with no payment-provider fields in its metadata payload", () => {
    const logCalls = fnBody.match(/PERFORM public\.log_activity\(/g) ?? [];
    expect(logCalls).toHaveLength(1);
    expect(fnBody).toMatch(/'PROJECT_MARKED_PAID'/);

    const metadataMatch = fnBody.match(
      /PERFORM public\.log_activity\(([\s\S]*?)\);/,
    );
    expect(metadataMatch).not.toBeNull();
    const metadataArg = metadataMatch![1];
    expect(metadataArg).not.toMatch(/provider|card_|transaction_id|gateway/i);
    expect(metadataArg).toMatch(/jsonb_build_object\(\s*\n\s*'previous_payment_status', 'UNPAID',\s*\n\s*'payment_status', 'PAID'/);
  });

  it("locks the projects row FOR UPDATE before any decision (composes with the existing commercial-freeze lock)", () => {
    const lockIdx = fnBody.indexOf("FROM public.projects AS p");
    const forUpdateIdx = fnBody.indexOf("FOR UPDATE", lockIdx);
    const decisionIdx = fnBody.indexOf("USING ERRCODE = 'PL007'");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(forUpdateIdx).toBeGreaterThan(lockIdx);
    expect(forUpdateIdx).toBeLessThan(decisionIdx);
  });
});

describe("Task 025 Phase 1 — reassign_project_staff", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "reassign_project_staff");

  it("no-op check (PL008) is NULL-safe via IS NOT DISTINCT FROM", () => {
    expect(fnBody).toMatch(
      /IF p_assigned_staff_id IS NOT DISTINCT FROM v_current_assigned_staff_id THEN/,
    );
  });

  it("validates a non-NULL target inside the function (never a client-supplied boolean), locking the target profile row FOR UPDATE", () => {
    const block = fnBody.match(
      /IF p_assigned_staff_id IS NOT NULL THEN([\s\S]*?)END IF;\s*\n\s*\n\s*-- E\./,
    );
    expect(block).not.toBeNull();
    const validation = block![1];
    expect(validation).toMatch(/FROM public\.profiles AS p/);
    expect(validation).toMatch(/FOR UPDATE/);
    expect(validation).toMatch(/NOT FOUND/);
    expect(validation).toMatch(/v_target_is_active IS NOT TRUE/);
    expect(validation).toMatch(/v_target_role NOT IN \('STAFF', 'ADMIN'\)/);
    expect(validation).toMatch(/ERRCODE = 'PL009'/);
  });

  it("mutates only assigned_staff_id, never touching status/payment_status", () => {
    const updateMatch = fnBody.match(/UPDATE public\.projects AS p SET[\s\S]*?RETURNING p\.\* INTO v_result;/);
    expect(updateMatch).not.toBeNull();
    const updateStmt = updateMatch![0];
    expect(updateStmt).toMatch(/assigned_staff_id = p_assigned_staff_id/);
    expect(updateStmt).not.toMatch(/\bstatus\s*=/);
    expect(updateStmt).not.toMatch(/payment_status\s*=/);
  });

  it("logs exactly one STAFF_ASSIGNMENT_CHANGED activity row with previous/new assignee metadata", () => {
    const logCalls = fnBody.match(/PERFORM public\.log_activity\(/g) ?? [];
    expect(logCalls).toHaveLength(1);
    expect(fnBody).toMatch(/'STAFF_ASSIGNMENT_CHANGED'/);
    expect(fnBody).toMatch(/'previous_assigned_staff_id', v_current_assigned_staff_id/);
    expect(fnBody).toMatch(/'assigned_staff_id', p_assigned_staff_id/);
  });
});

describe("Task 025 Phase 1 — shared security model across all three functions", () => {
  const contents = readMigration();
  const fnNames = ["transition_project_status", "mark_project_paid", "reassign_project_staff"];

  it("every function is SECURITY DEFINER with SET search_path = ''", () => {
    for (const fn of fnNames) {
      const start = contents.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const body = contents.slice(start, start + 2000);
      expect(body).toMatch(/SECURITY DEFINER/);
      expect(body).toMatch(/SET search_path = ''/);
    }
  });

  it("public.is_staff() is called as an executable authorization condition exactly 3 times (once per function)", () => {
    const matches = contents.match(/IF\s+public\.is_staff\(\)\s+IS\s+NOT\s+TRUE\s+THEN/g);
    expect(matches?.length).toBe(3);
  });

  it("every function locks its own caller's profiles row FOR UPDATE before checking is_staff()", () => {
    for (const fn of fnNames) {
      const body = extractFunctionBody(contents, fn);
      const callerSection = extractCallerAuthSection(body);
      expect(callerSection).toMatch(/FROM public\.profiles AS p\s*\n\s*WHERE p\.id = auth\.uid\(\)\s*\n\s*FOR UPDATE;/);
      const lockIdx = callerSection.indexOf("FOR UPDATE;");
      // Searches for the executable authorization condition specifically
      // (not a bare "public.is_staff()" substring, which can also appear
      // in this section's explanatory prose comments).
      const isStaffIdx = callerSection.indexOf("IF public.is_staff() IS NOT TRUE THEN");
      expect(lockIdx).toBeGreaterThan(-1);
      expect(isStaffIdx).toBeGreaterThan(lockIdx);
    }
  });

  it("the caller-authorization section of every function never duplicates is_staff()'s role/is_active check locally", () => {
    for (const fn of fnNames) {
      const body = extractFunctionBody(contents, fn);
      const callerSection = extractCallerAuthSection(body);
      expect(callerSection).not.toMatch(/v_caller_role/);
      expect(callerSection).not.toMatch(/v_caller_is_active/);
      expect(callerSection).not.toMatch(/p\.role/);
      expect(callerSection).not.toMatch(/p\.is_active/);
    }
  });

  it("only authenticated is granted EXECUTE on all three functions (never anon/service_role/PUBLIC)", () => {
    const grantMatches = contents.match(/GRANT EXECUTE ON FUNCTION[^;]+;/g) ?? [];
    expect(grantMatches.length).toBe(3);
    for (const grant of grantMatches) {
      expect(grant).toMatch(/TO authenticated/);
      expect(grant).not.toMatch(/anon|service_role|PUBLIC/);
    }
  });

  it("every function's privileges are revoked from PUBLIC/anon/authenticated/service_role before being re-granted", () => {
    for (const fn of fnNames) {
      const sigMatch = contents.match(new RegExp(`CREATE FUNCTION public\\.${fn}\\(([^)]*)\\)`));
      expect(sigMatch).not.toBeNull();
      const revokeBlock = contents.match(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${fn}\\([^;]+;\\s*\\nREVOKE ALL ON FUNCTION public\\.${fn}\\([^;]+;\\s*\\nREVOKE ALL ON FUNCTION public\\.${fn}\\([^;]+;\\s*\\nREVOKE ALL ON FUNCTION public\\.${fn}\\([^;]+;`,
        ),
      );
      expect(revokeBlock).not.toBeNull();
      expect(revokeBlock![0]).toMatch(/FROM PUBLIC/);
      expect(revokeBlock![0]).toMatch(/FROM anon/);
      expect(revokeBlock![0]).toMatch(/FROM authenticated/);
      expect(revokeBlock![0]).toMatch(/FROM service_role/);
    }
  });
});

describe("Task 025 Phase 1 — projects table privilege tightening", () => {
  const contents = readMigration();

  it("revokes table-wide UPDATE on projects from authenticated", () => {
    expect(contents).toMatch(/REVOKE UPDATE ON TABLE public\.projects FROM authenticated;/);
  });

  it("re-grants column-level UPDATE excluding the six lifecycle/payment/assignment columns", () => {
    const grantMatch = contents.match(
      /GRANT UPDATE \(([\s\S]*?)\) ON TABLE public\.projects TO authenticated;/,
    );
    expect(grantMatch).not.toBeNull();
    const columns = grantMatch![1]
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    const lockedDown = [
      "status",
      "payment_status",
      "paid_at",
      "assigned_staff_id",
      "completed_at",
      "archived_at",
    ];
    for (const col of lockedDown) {
      expect(columns).not.toContain(col);
    }

    // Every other projects column (migration 0005) remains updatable —
    // preserving pre-existing behavior for everything outside Task 025's
    // scope (CLAUDE.md §2).
    const preserved = [
      "id",
      "project_code",
      "customer_id",
      "event_type",
      "deadline_at",
      "service_package_id",
      "package_code_snapshot",
      "package_name_snapshot",
      "base_price_vnd",
      "addon_total_vnd",
      "total_price_vnd",
      "internal_note",
      "created_by",
      "created_at",
      "updated_at",
    ];
    expect(columns.sort()).toEqual(preserved.sort());
  });

  it("the REVOKE precedes the re-GRANT (no window where authenticated has table-wide UPDATE and the narrow GRANT both apply ambiguously)", () => {
    const revokeIdx = contents.indexOf("REVOKE UPDATE ON TABLE public.projects FROM authenticated;");
    const grantIdx = contents.indexOf("GRANT UPDATE (");
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(revokeIdx);
  });
});

describe("Task 025 Phase 1 — static/security review of existing Phase 1 files", () => {
  it.each(FILES_UNDER_REVIEW)("%s never references service_role", (relativePath) => {
    const contents = readFileSync(join(ROOT, relativePath), "utf8");
    expect(contents).not.toMatch(/service_role/i);
  });

  it.each(FILES_UNDER_REVIEW)("%s never calls log_activity directly", (relativePath) => {
    const contents = readFileSync(join(ROOT, relativePath), "utf8");
    expect(contents).not.toMatch(/log_activity/);
  });
});
