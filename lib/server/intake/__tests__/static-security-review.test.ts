import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security + structural review for Task 027 Authoring Phase 1
 * (migration 0026_intake_actions.sql), covering both the original authoring
 * pass and Independent Review Patch 1 (Findings A/C/D — see the migration's
 * own header for the full rationale). This migration and the ISxxx
 * error-code map (reviewed separately in intake-rpc-error-codes.test.ts)
 * are the only Task 027 Phase 1 artifacts to review at this checkpoint.
 * Mirrors the review style of
 * lib/server/access-links/__tests__/static-security-review.test.ts
 * (Task 026 Phase 1): read the actual migration SQL text and assert on it
 * directly, never assume its contents or hand-duplicate the business logic.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const MIGRATION_FILENAME = "20260911041146_0026_intake_actions.sql";
const MIGRATION_PATH = join(MIGRATIONS_DIR, MIGRATION_FILENAME);

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

const FN_NAMES = ["submit_intake_submission", "apply_intake_submission", "reject_intake_submission"];
const STAFF_FN_NAMES = ["apply_intake_submission", "reject_intake_submission"];

describe("Task 027 Phase 1 — migration file placement", () => {
  // Deliberately does NOT assert "0026 is the newest migration in the
  // repository" — Task 026 demonstrated exactly why that global-latest
  // assertion is wrong (see the Finding B correction to
  // lib/server/access-links/__tests__/phase3-static-security-review.test.ts):
  // a later task (028+) will legitimately add a migration after this one.
  // The only relationship this migration actually owns and must keep true
  // forever is its position immediately after 0025.
  it("0026_intake_actions.sql exists and sorts immediately after 0025", () => {
    const files = readdirSync(MIGRATIONS_DIR).sort();
    expect(files).toContain(MIGRATION_FILENAME);
    const idx0025 = files.findIndex((f) => f.includes("0025_access_link_actions"));
    const idx0026 = files.indexOf(MIGRATION_FILENAME);
    expect(idx0025).toBeGreaterThan(-1);
    expect(idx0026).toBe(idx0025 + 1);
  });
});

describe("Task 027 Phase 1 Finding A — no service-role GUC/JWT self-check of any kind anywhere in migration 0026", () => {
  const contents = readMigration();

  // Scoped to actual code lines, not comment prose — mirrors
  // lib/server/access-links/__tests__/phase3-static-security-review.test.ts's
  // own SERVICE_ROLE_USAGE_PATTERN precedent: an explanatory doc comment
  // legitimately naming a rejected mechanism (exactly what this migration's
  // own SUBMIT CALLER BOUNDARY section does, to record what was considered
  // and rejected) is not a reintroduction of it. A real check would appear
  // in actual SQL/plpgsql code, never only inside a `--`-prefixed line.
  function codeLines(source: string): string[] {
    return source.split("\n").filter((line) => !line.trim().startsWith("--"));
  }
  const code = codeLines(contents).join("\n");

  it("contains no auth.role( in actual code (comment prose may still name it, to document what was rejected)", () => {
    expect(code).not.toMatch(/auth\.role\(/);
  });

  it("never attempts an alternative GUC/JWT introspection trick as a replacement in actual code (session_user, current_setting('role'), current_role, auth.jwt())", () => {
    expect(code).not.toMatch(/\bsession_user\b/);
    expect(code).not.toMatch(/current_setting\(\s*'role'/);
    expect(code).not.toMatch(/\bcurrent_role\b/);
    expect(code).not.toMatch(/auth\.jwt\(/);
  });

  it("submit_intake_submission's caller-identity boundary is documented as GRANT EXECUTE TO service_role, not an in-body check", () => {
    expect(contents).toMatch(/SUBMIT CALLER BOUNDARY/);
    expect(contents).toMatch(/sole,? intentional caller-identity boundary is the explicit PostgreSQL/);
  });
});

describe("Task 027 Phase 1 — no scope creep / no table shape change", () => {
  const contents = readMigration();

  it("creates exactly three functions", () => {
    const matches = contents.match(/CREATE FUNCTION public\./g) ?? [];
    expect(matches.length).toBe(3);
    for (const fn of FN_NAMES) {
      expect(contents).toMatch(new RegExp(`CREATE FUNCTION public\\.${fn}\\(`));
    }
  });

  it("never creates, alters, or drops a table", () => {
    expect(contents).not.toMatch(/^CREATE TABLE/m);
    expect(contents).not.toMatch(/^ALTER TABLE/m);
    expect(contents).not.toMatch(/^DROP TABLE/m);
  });

  it("never adds a column, constraint, or index (no table-shape change)", () => {
    expect(contents).not.toMatch(/ADD COLUMN/);
    expect(contents).not.toMatch(/ADD CONSTRAINT/);
    expect(contents).not.toMatch(/^CREATE (UNIQUE )?INDEX/m);
    expect(contents).not.toMatch(/^DROP INDEX/m);
  });

  it("never drops or creates an RLS policy (privilege change only, mirrors 0021/0025's TABLE PRIVILEGE TIGHTENING pattern)", () => {
    expect(contents).not.toMatch(/^DROP POLICY/m);
    expect(contents).not.toMatch(/^CREATE POLICY/m);
  });

  it("never redefines or drops the existing intake_submissions guard triggers (0015)", () => {
    expect(contents).not.toMatch(/^CREATE (OR REPLACE )?FUNCTION public\.guard_intake_link_type/m);
    expect(contents).not.toMatch(/^CREATE (OR REPLACE )?FUNCTION public\.guard_intake_submission_immutability/m);
    expect(contents).not.toMatch(/^DROP TRIGGER/m);
    expect(contents).not.toMatch(/^DROP FUNCTION/m);
  });

  it("never mutates project_events or project_media (frozen out-of-scope, Task 027 preflight)", () => {
    expect(contents).not.toMatch(/INSERT INTO public\.project_events/);
    expect(contents).not.toMatch(/UPDATE public\.project_events/);
    expect(contents).not.toMatch(/INSERT INTO public\.project_media/);
    expect(contents).not.toMatch(/UPDATE public\.project_media/);
  });

  it("never grants a DELETE path on intake_submissions to any role (frozen §14 — no DELETE path)", () => {
    expect(contents).not.toMatch(/GRANT[^;\n]*DELETE[^;\n]*ON TABLE public\.intake_submissions/i);
  });

  it("never introduces a partial-unique/single-PENDING constraint (frozen §3 — multiple PENDING submissions allowed)", () => {
    expect(contents).not.toMatch(/UNIQUE\s*\([^)]*status[^)]*\)/i);
    expect(contents).not.toMatch(/CREATE UNIQUE INDEX/i);
  });

  it("every function's privileges are revoked from PUBLIC/anon/authenticated/service_role before being re-granted", () => {
    for (const fn of FN_NAMES) {
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

describe("Task 027 Phase 1 — execute-grant role boundaries", () => {
  const contents = readMigration();

  it("submit_intake_submission is granted EXECUTE to service_role only", () => {
    const grantMatch = contents.match(
      /GRANT EXECUTE ON FUNCTION public\.submit_intake_submission\(([\s\S]*?)\) TO ([a-z_]+);/,
    );
    expect(grantMatch).not.toBeNull();
    expect(grantMatch![2]).toBe("service_role");
    const grantMatches = contents.match(/GRANT EXECUTE ON FUNCTION public\.submit_intake_submission\([^;]+;/g) ?? [];
    expect(grantMatches).toHaveLength(1);
  });

  it.each(STAFF_FN_NAMES)("%s is granted EXECUTE to authenticated only", (fn) => {
    const grantMatch = contents.match(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(([\\s\\S]*?)\\) TO ([a-z_]+);`),
    );
    expect(grantMatch).not.toBeNull();
    expect(grantMatch![2]).toBe("authenticated");
  });

  it("never grants service_role EXECUTE on apply_intake_submission or reject_intake_submission", () => {
    for (const fn of STAFF_FN_NAMES) {
      expect(contents).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^;\n]*TO service_role`));
    }
  });

  it("never grants authenticated EXECUTE on submit_intake_submission", () => {
    expect(contents).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_intake_submission\([^;\n]*TO authenticated/);
  });

  it("never grants PUBLIC or anon EXECUTE on any of the three functions", () => {
    const grantMatches = contents.match(/GRANT EXECUTE ON FUNCTION[^;]+;/g) ?? [];
    expect(grantMatches.length).toBe(3);
    for (const grant of grantMatches) {
      expect(grant).not.toMatch(/TO PUBLIC/);
      expect(grant).not.toMatch(/TO anon/);
    }
  });
});

describe("Task 027 Phase 1 — shared SECURITY DEFINER model", () => {
  const contents = readMigration();

  it("every function is SECURITY DEFINER with SET search_path = ''", () => {
    for (const fn of FN_NAMES) {
      const start = contents.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const body = contents.slice(start, start + 2500);
      expect(body).toMatch(/SECURITY DEFINER/);
      expect(body).toMatch(/SET search_path = ''/);
    }
  });

  it("apply_intake_submission and reject_intake_submission each self-authorize via the caller-profile-lock + is_staff() pattern, raising IS001", () => {
    for (const fn of STAFF_FN_NAMES) {
      const body = extractFunctionBody(contents, fn);
      expect(body).toMatch(
        /FROM public\.profiles AS p\s*\n\s*WHERE p\.id = auth\.uid\(\)\s*\n\s*FOR UPDATE;/,
      );
      const lockIdx = body.indexOf("FOR UPDATE;");
      const isStaffIdx = body.indexOf("IF public.is_staff() IS NOT TRUE THEN");
      expect(lockIdx).toBeGreaterThan(-1);
      expect(isStaffIdx).toBeGreaterThan(lockIdx);
      const is001Matches = body.match(/USING ERRCODE = 'IS001'/g) ?? [];
      expect(is001Matches.length).toBe(3); // auth.uid() NULL, profile not found, is_staff() false
    }
  });

  it("the caller-authorization section of both staff functions never duplicates is_staff()'s role/is_active check locally", () => {
    for (const fn of STAFF_FN_NAMES) {
      const body = extractFunctionBody(contents, fn);
      const authSection = body.slice(0, body.indexOf("IF public.is_staff() IS NOT TRUE THEN") + 100);
      expect(authSection).not.toMatch(/v_caller_role/);
      expect(authSection).not.toMatch(/v_caller_is_active/);
      expect(authSection).not.toMatch(/p\.role/);
      expect(authSection).not.toMatch(/p\.is_active/);
    }
  });

  it("submit_intake_submission never uses the staff auth.uid()/is_staff() pattern (it is the customer/server path)", () => {
    const body = extractFunctionBody(contents, "submit_intake_submission");
    expect(body).not.toMatch(/public\.is_staff\(\)/);
    expect(body).not.toMatch(/FROM public\.profiles/);
    expect(body).not.toMatch(/USING ERRCODE = 'IS001'/);
  });
});

describe("Task 027 Phase 1 — submit_intake_submission", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "submit_intake_submission");

  it("has no in-function caller-identity check — the sole caller-identity boundary is GRANT EXECUTE TO service_role (Finding A)", () => {
    expect(fnBody).not.toMatch(/auth\.role\(/);
    expect(fnBody).not.toMatch(/session_user/);
    expect(fnBody).not.toMatch(/current_setting\(\s*'role'/);
    expect(fnBody).not.toMatch(/current_role/);
    expect(fnBody).not.toMatch(/auth\.jwt\(/);
  });

  it("never raises IS002 anywhere (removed by Finding A; gap intentionally left, not renumbered)", () => {
    expect(fnBody).not.toMatch(/USING ERRCODE = 'IS002'/);
  });

  it("never accepts a raw token/hash/hint parameter", () => {
    const sigMatch = contents.match(/CREATE FUNCTION public\.submit_intake_submission\(([\s\S]*?)\)\s*\nRETURNS/);
    expect(sigMatch).not.toBeNull();
    expect(sigMatch![1]).not.toMatch(/token/i);
  });

  it("re-validates the access-link context with a FOR UPDATE lock, collapsing not-found/wrong-project/wrong-purpose into IS004", () => {
    expect(fnBody).toMatch(
      /FROM public\.project_access_links AS p\s*\n\s*WHERE p\.id = p_access_link_id\s*\n\s*FOR UPDATE;/,
    );
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Access link not found'\s*\n\s*USING ERRCODE = 'IS004';/);
    const is004Section = fnBody.slice(0, fnBody.indexOf("USING ERRCODE = 'IS004'"));
    expect(is004Section).toMatch(/NOT FOUND/);
    expect(is004Section).toMatch(/v_link_project IS DISTINCT FROM p_project_id/);
    expect(is004Section).toMatch(/v_link_type IS DISTINCT FROM 'INTAKE'/);
  });

  it("checks revoked (IS005) and expired (IS006) in that order, after IS004", () => {
    const is004Idx = fnBody.indexOf("USING ERRCODE = 'IS004'");
    const is005Idx = fnBody.indexOf("USING ERRCODE = 'IS005'");
    const is006Idx = fnBody.indexOf("USING ERRCODE = 'IS006'");
    expect(is004Idx).toBeGreaterThan(-1);
    expect(is005Idx).toBeGreaterThan(is004Idx);
    expect(is006Idx).toBeGreaterThan(is005Idx);
    expect(fnBody).toMatch(/IF v_revoked_at IS NOT NULL THEN/);
    expect(fnBody).toMatch(/IF v_expires_at IS NOT NULL AND v_expires_at <= now\(\) THEN/);
  });

  it("never writes to project_access_links (last_used_at was already touched by the Phase 2 resolution step)", () => {
    expect(fnBody).not.toMatch(/UPDATE public\.project_access_links/);
  });

  it("inserts exactly one PENDING row with a literal status (never a caller-supplied status parameter)", () => {
    const insertMatches = fnBody.match(/INSERT INTO public\.intake_submissions/g) ?? [];
    expect(insertMatches).toHaveLength(1);
    const insertMatch = fnBody.match(
      /INSERT INTO public\.intake_submissions \([\s\S]*?\) VALUES \(([\s\S]*?)\)\s*\n\s*RETURNING/,
    );
    expect(insertMatch).not.toBeNull();
    expect(insertMatch![1]).toMatch(/'PENDING'/);
    expect(contents).not.toMatch(/p_status/);
  });

  it("logs exactly one CUSTOMER_SUBMISSION_RECEIVED activity row with actor_type CUSTOMER", () => {
    const logCalls = fnBody.match(/PERFORM public\.log_activity\(/g) ?? [];
    expect(logCalls).toHaveLength(1);
    expect(fnBody).toMatch(/'CUSTOMER_SUBMISSION_RECEIVED'/);
    expect(fnBody).toMatch(/PERFORM public\.log_activity\(\s*\n\s*p_project_id,\s*\n\s*'CUSTOMER',/);
  });

  it("activity metadata contains only intake_submission_id/access_link_id — never the payload, PII, or token material", () => {
    const metadataMatch = fnBody.match(/PERFORM public\.log_activity\(([\s\S]*?)\);/);
    expect(metadataMatch).not.toBeNull();
    const metadataArg = metadataMatch![1];
    expect(metadataArg).toMatch(/'intake_submission_id', v_result\.id/);
    expect(metadataArg).toMatch(/'access_link_id', p_access_link_id/);
    expect(metadataArg).not.toMatch(/v_payload/);
    expect(metadataArg).not.toMatch(/token_hash|token_hint|p_groom_name|p_bride_name/);
  });

  it("the activity call happens after the mutating INSERT (no log before a real mutation)", () => {
    const insertIdx = fnBody.indexOf("INSERT INTO public.intake_submissions");
    const logIdx = fnBody.indexOf("PERFORM public.log_activity(");
    expect(insertIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeGreaterThan(insertIdx);
  });

  it("never returns the stored payload", () => {
    const returnsMatch = contents.match(
      /CREATE FUNCTION public\.submit_intake_submission\([\s\S]*?RETURNS TABLE \(([\s\S]*?)\)\s*\nLANGUAGE/,
    );
    expect(returnsMatch).not.toBeNull();
    expect(returnsMatch![1]).not.toMatch(/payload/);
  });
});

describe("Task 027 Phase 1 — apply_intake_submission", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "apply_intake_submission");

  it("never accepts a Wedding Details field parameter (only project id and submission id)", () => {
    const sigMatch = contents.match(/CREATE FUNCTION public\.apply_intake_submission\(([\s\S]*?)\)\s*\nRETURNS/);
    expect(sigMatch).not.toBeNull();
    const params = sigMatch![1]
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    expect(params).toHaveLength(2);
    expect(params[0]).toMatch(/^p_project_id uuid$/);
    expect(params[1]).toMatch(/^p_submission_id uuid$/);
  });

  it("locks the target Project row and raises IS003 when not found", () => {
    expect(fnBody).toMatch(/FROM public\.projects AS pr\s*\n\s*WHERE pr\.id = p_project_id\s*\n\s*FOR UPDATE;/);
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Project not found'\s*\n\s*USING ERRCODE = 'IS003';/);
  });

  it("locks the exact submission row matched on BOTH id and project_id, raising IS007 when not found", () => {
    expect(fnBody).toMatch(
      /FROM public\.intake_submissions AS s\s*\n\s*WHERE s\.id = p_submission_id\s*\n\s*AND s\.project_id = p_project_id\s*\n\s*FOR UPDATE;/,
    );
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Intake submission not found'\s*\n\s*USING ERRCODE = 'IS007';/);
  });

  it("rejects a non-PENDING submission with IS008", () => {
    expect(fnBody).toMatch(/IF v_submission_status <> 'PENDING' THEN/);
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Intake submission is not pending'\s*\n\s*USING ERRCODE = 'IS008';/);
  });

  it("composes with save_wedding_details() exactly once, passing p_project_id and the 20 payload fields positionally", () => {
    const calls = fnBody.match(/public\.save_wedding_details\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const callMatch = fnBody.match(/FROM public\.save_wedding_details\(([\s\S]*?)\)\s*AS sw;/);
    expect(callMatch).not.toBeNull();
    const args = callMatch![1];
    expect(args).toMatch(/p_project_id,/);
    for (const key of [
      "groomName",
      "brideName",
      "groomFather",
      "groomMother",
      "brideFather",
      "brideMother",
      "groomFamilyAddress",
      "brideFamilyAddress",
      "invitationMessage",
      "loveStory",
      "lunarDateDisplay",
      "additionalNote",
      "groomBankName",
      "groomBankAccountName",
      "groomBankAccountNumber",
      "groomBankQrMediaId",
      "brideBankName",
      "brideBankAccountName",
      "brideBankAccountNumber",
      "brideBankQrMediaId",
    ]) {
      expect(args).toMatch(new RegExp(`v_payload ->> '${key}'|\\(v_payload ->> '${key}'\\)::uuid`));
    }
  });

  it("never calls log_activity directly (CANONICAL_DATA_APPLIED is logged inside the composed save_wedding_details call)", () => {
    expect(fnBody).not.toMatch(/PERFORM public\.log_activity/);
    expect(fnBody).not.toMatch(/'CANONICAL_DATA_APPLIED'/);
  });

  it("updates exactly status/reviewed_by/reviewed_at on the submission — never payload/project_id/access_link_id/submitted_at", () => {
    const updateMatch = fnBody.match(
      /UPDATE public\.intake_submissions AS s SET\s*\n([\s\S]*?)\s*\n\s*WHERE s\.id = p_submission_id/,
    );
    expect(updateMatch).not.toBeNull();
    const setClause = updateMatch![1];
    expect(setClause).toMatch(/status = 'APPLIED'/);
    expect(setClause).toMatch(/reviewed_by = auth\.uid\(\)/);
    expect(setClause).toMatch(/reviewed_at = now\(\)/);
    expect(setClause).not.toMatch(/payload/);
    expect(setClause).not.toMatch(/project_id\s*=/);
    expect(setClause).not.toMatch(/access_link_id\s*=/);
    expect(setClause).not.toMatch(/submitted_at\s*=/);
    expect(setClause).not.toMatch(/staff_note/);
  });

  it("updates exactly one submission row (no sibling mutation)", () => {
    const updates = fnBody.match(/UPDATE public\.intake_submissions/g) ?? [];
    expect(updates).toHaveLength(1);
  });

  it("never touches project_events, project_media, or project lifecycle/status/payment columns", () => {
    expect(fnBody).not.toMatch(/project_events/);
    expect(fnBody).not.toMatch(/project_media/);
    expect(fnBody).not.toMatch(/\bstatus\s*=\s*'(DRAFT|IN_PROGRESS|REVIEW|PUBLISHED|ARCHIVED)'/);
    expect(fnBody).not.toMatch(/payment_status/);
  });
});

describe("Task 027 Phase 1 — reject_intake_submission", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "reject_intake_submission");

  it("accepts project id, submission id, and a nullable staff note only", () => {
    const sigMatch = contents.match(/CREATE FUNCTION public\.reject_intake_submission\(([\s\S]*?)\)\s*\nRETURNS/);
    expect(sigMatch).not.toBeNull();
    const params = sigMatch![1]
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    expect(params).toHaveLength(3);
    expect(params[0]).toMatch(/^p_project_id uuid$/);
    expect(params[1]).toMatch(/^p_submission_id uuid$/);
    expect(params[2]).toMatch(/^p_staff_note text DEFAULT NULL$/);
  });

  it("locks the target Project row and raises IS003 when not found", () => {
    expect(fnBody).toMatch(/FROM public\.projects AS pr\s*\n\s*WHERE pr\.id = p_project_id\s*\n\s*FOR UPDATE;/);
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Project not found'\s*\n\s*USING ERRCODE = 'IS003';/);
  });

  it("locks the exact submission row matched on BOTH id and project_id, raising IS007 when not found", () => {
    expect(fnBody).toMatch(
      /FROM public\.intake_submissions AS s\s*\n\s*WHERE s\.id = p_submission_id\s*\n\s*AND s\.project_id = p_project_id\s*\n\s*FOR UPDATE;/,
    );
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Intake submission not found'\s*\n\s*USING ERRCODE = 'IS007';/);
  });

  it("rejects a non-PENDING submission with IS008", () => {
    expect(fnBody).toMatch(/IF v_submission_status <> 'PENDING' THEN/);
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Intake submission is not pending'\s*\n\s*USING ERRCODE = 'IS008';/);
  });

  it("updates exactly status/reviewed_by/reviewed_at/staff_note — never payload/project_id/access_link_id/submitted_at", () => {
    const updateMatch = fnBody.match(
      /UPDATE public\.intake_submissions AS s SET\s*\n([\s\S]*?)\s*\n\s*WHERE s\.id = p_submission_id/,
    );
    expect(updateMatch).not.toBeNull();
    const setClause = updateMatch![1];
    expect(setClause).toMatch(/status = 'REJECTED'/);
    expect(setClause).toMatch(/reviewed_by = auth\.uid\(\)/);
    expect(setClause).toMatch(/reviewed_at = now\(\)/);
    expect(setClause).toMatch(/staff_note = p_staff_note/);
    expect(setClause).not.toMatch(/payload/);
    expect(setClause).not.toMatch(/project_id\s*=/);
    expect(setClause).not.toMatch(/access_link_id\s*=/);
    expect(setClause).not.toMatch(/submitted_at\s*=/);
  });

  it("never calls save_wedding_details or writes to wedding_details (doc-comment prose mentioning either term does not count as a call/write)", () => {
    expect(fnBody).not.toMatch(/public\.save_wedding_details\(/);
    expect(fnBody).not.toMatch(/(INSERT INTO|UPDATE)\s+public\.wedding_details/);
  });

  it("never calls log_activity (no frozen REJECTED activity type exists; doc-comment prose mentioning it does not count as a call)", () => {
    expect(fnBody).not.toMatch(/public\.log_activity\(/);
  });

  it("updates exactly one submission row (no sibling mutation)", () => {
    const updates = fnBody.match(/UPDATE public\.intake_submissions/g) ?? [];
    expect(updates).toHaveLength(1);
  });
});

describe("Task 027 Phase 1 — no new activity action invented (frozen union, docs/API_CONTRACT.md §6)", () => {
  const contents = readMigration();

  const FROZEN_UNION = [
    "CUSTOMER_SUBMISSION_RECEIVED",
    "CANONICAL_DATA_APPLIED",
    "INVITATION_REVIEW_CREATED",
    "REVIEW_LINK_ISSUED",
    "REVISION_REQUESTED",
    "CUSTOMER_APPROVED",
    "PROJECT_MARKED_PAID",
    "INVITATION_PUBLISHED",
    "INVITATION_REPUBLISHED",
    "ACCESS_LINK_REVOKED",
    "ACCESS_LINK_ROTATED",
    "GUEST_IMPORTED",
    "GUEST_REVOKED",
    "STAFF_ASSIGNMENT_CHANGED",
    "PROJECT_STATUS_CHANGED",
    "PROJECT_ARCHIVED",
  ];

  it("this migration calls log_activity exactly once, with an action already in the frozen union", () => {
    const logCalls = contents.match(/PERFORM public\.log_activity\(/g) ?? [];
    expect(logCalls).toHaveLength(1);
    const actionMatch = contents.match(/PERFORM public\.log_activity\(\s*\n\s*p_project_id,\s*\n\s*'CUSTOMER',\s*\n\s*'([A-Z_]+)'/);
    expect(actionMatch).not.toBeNull();
    expect(FROZEN_UNION).toContain(actionMatch![1]);
    expect(actionMatch![1]).toBe("CUSTOMER_SUBMISSION_RECEIVED");
  });

  it("never invents a REJECTED/INTAKE_REJECTED/SUBMISSION_REJECTED-style activity type", () => {
    expect(contents).not.toMatch(/'INTAKE_SUBMISSION_REJECTED'/);
    expect(contents).not.toMatch(/'SUBMISSION_REJECTED'/);
    expect(contents).not.toMatch(/'INTAKE_REJECTED'/);
  });
});

describe("Task 027 Phase 1 — privilege hardening on intake_submissions", () => {
  const contents = readMigration();

  it("revokes INSERT on intake_submissions from service_role, with no re-grant anywhere after it", () => {
    expect(contents).toMatch(/REVOKE INSERT ON TABLE public\.intake_submissions FROM service_role;/);
    const revokeIdx = contents.indexOf("REVOKE INSERT ON TABLE public.intake_submissions FROM service_role;");
    const rest = contents.slice(revokeIdx);
    expect(rest).not.toMatch(/GRANT INSERT[^;\n]*ON TABLE public\.intake_submissions[^;\n]*TO service_role/);
  });

  it("revokes UPDATE on intake_submissions from authenticated, with no re-grant anywhere after it", () => {
    expect(contents).toMatch(/REVOKE UPDATE ON TABLE public\.intake_submissions FROM authenticated;/);
    const revokeIdx = contents.indexOf("REVOKE UPDATE ON TABLE public.intake_submissions FROM authenticated;");
    const rest = contents.slice(revokeIdx);
    expect(rest).not.toMatch(/GRANT UPDATE[^;\n]*ON TABLE public\.intake_submissions[^;\n]*TO authenticated/);
  });

  it("never touches authenticated's SELECT grant on intake_submissions (staff read visibility preserved)", () => {
    expect(contents).not.toMatch(/REVOKE[^;\n]*SELECT[^;\n]*ON TABLE public\.intake_submissions[^;\n]*FROM authenticated/);
    expect(contents).not.toMatch(/GRANT[^;\n]*SELECT[^;\n]*ON TABLE public\.intake_submissions[^;\n]*TO authenticated/);
  });

  it("never grants any intake_submissions table privilege to anon or PUBLIC", () => {
    expect(contents).not.toMatch(/GRANT[^;\n]*ON TABLE public\.intake_submissions[^;\n]*TO anon/);
    expect(contents).not.toMatch(/GRANT[^;\n]*ON TABLE public\.intake_submissions[^;\n]*TO PUBLIC/);
  });

  it("never grants service_role SELECT/UPDATE/DELETE on intake_submissions (service_role's only capability is EXECUTE submit_intake_submission)", () => {
    expect(contents).not.toMatch(/GRANT[^;\n]*SELECT[^;\n]*ON TABLE public\.intake_submissions[^;\n]*TO service_role/);
    expect(contents).not.toMatch(/GRANT[^;\n]*UPDATE[^;\n]*ON TABLE public\.intake_submissions[^;\n]*TO service_role/);
    expect(contents).not.toMatch(/GRANT[^;\n]*DELETE[^;\n]*ON TABLE public\.intake_submissions[^;\n]*TO service_role/);
  });
});
