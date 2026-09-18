import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security + structural review for Task 026 Authoring Phase 1
 * (migration 0025_access_link_actions.sql). No application/API layer exists
 * yet (Phase 1 scope, per this migration's own "AUTHORING ONLY" header) —
 * this migration and the ALxxx error-code map (reviewed separately in
 * access-link-rpc-error-codes.test.ts) are the only Task 026 artifacts to
 * review at this checkpoint. The frozen business rules these tests assert
 * against are recorded in docs/DECISIONS.md "Task 026 — Access-Link & Token
 * Foundation" (D1–D13), mirroring the review style of
 * lib/server/project-lifecycle/__tests__/static-security-review.test.ts
 * (Task 025) and lib/server/project-events/__tests__/static-security-review.test.ts
 * (Task 023): read the actual migration SQL text and assert on it directly,
 * never assume its contents or hand-duplicate the business logic.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const MIGRATION_FILENAME = "20260911041145_0025_access_link_actions.sql";
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

const FN_NAMES = ["issue_review_link", "rotate_access_link", "revoke_access_link"];

describe("Task 026 Phase 1 — migration file placement", () => {
  it("0025_access_link_actions.sql exists and sorts immediately after 0024", () => {
    const files = readdirSync(MIGRATIONS_DIR).sort();
    expect(files).toContain(MIGRATION_FILENAME);
    const idx0024 = files.findIndex((f) => f.includes("0024_project_lifecycle_payment_assignment"));
    const idx0025 = files.indexOf(MIGRATION_FILENAME);
    expect(idx0024).toBeGreaterThan(-1);
    expect(idx0025).toBe(idx0024 + 1);
  });
});

describe("Task 026 Phase 1 — no scope creep / no table shape change", () => {
  const contents = readMigration();

  it("creates exactly three functions", () => {
    const matches = contents.match(/CREATE FUNCTION public\./g) ?? [];
    expect(matches.length).toBe(3);
    expect(contents).toMatch(/CREATE FUNCTION public\.issue_review_link\(/);
    expect(contents).toMatch(/CREATE FUNCTION public\.rotate_access_link\(/);
    expect(contents).toMatch(/CREATE FUNCTION public\.revoke_access_link\(/);
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

  it("never introduces a new uniqueness/single-active constraint (D2 — multiple active links of the same type remain allowed)", () => {
    expect(contents).not.toMatch(/UNIQUE\s*\(\s*project_id\s*,\s*link_type/i);
    expect(contents).not.toMatch(/CREATE UNIQUE INDEX/i);
  });

  it("never redefines or drops the existing guard triggers (0014)", () => {
    expect(contents).not.toMatch(/^CREATE (OR REPLACE )?FUNCTION public\.guard_access_link_identity_immutability/m);
    expect(contents).not.toMatch(/^CREATE (OR REPLACE )?FUNCTION public\.guard_access_link_revocation_immutability/m);
    expect(contents).not.toMatch(/^DROP TRIGGER/m);
    expect(contents).not.toMatch(/^DROP FUNCTION/m);
  });

  it("never grants EXECUTE on any of the three functions to service_role (REVOKE FROM service_role is expected and present)", () => {
    const grantMatches = contents.match(/GRANT EXECUTE ON FUNCTION[^;]+;/g) ?? [];
    expect(grantMatches.length).toBe(3);
    for (const grant of grantMatches) {
      expect(grant).not.toMatch(/service_role/);
      expect(grant).not.toMatch(/anon/);
      expect(grant).not.toMatch(/PUBLIC/);
      expect(grant).toMatch(/TO authenticated/);
    }
  });

  it("every function's privileges are revoked from PUBLIC/anon/authenticated/service_role before being re-granted", () => {
    for (const fn of FN_NAMES) {
      const sigMatch = contents.match(new RegExp(`CREATE FUNCTION public\\.${fn}\\(([\\s\\S]*?)\\)\\s*\\nRETURNS`));
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

describe("Task 026 Phase 1 — shared security model across all three functions", () => {
  const contents = readMigration();

  it("every function is SECURITY DEFINER with SET search_path = ''", () => {
    for (const fn of FN_NAMES) {
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

  it("every function locks its own caller's profiles row FOR UPDATE before checking is_staff(), and raises AL001 on failure", () => {
    for (const fn of FN_NAMES) {
      const body = extractFunctionBody(contents, fn);
      expect(body).toMatch(
        /FROM public\.profiles AS p\s*\n\s*WHERE p\.id = auth\.uid\(\)\s*\n\s*FOR UPDATE;/,
      );
      const lockIdx = body.indexOf("FOR UPDATE;");
      const isStaffIdx = body.indexOf("IF public.is_staff() IS NOT TRUE THEN");
      expect(lockIdx).toBeGreaterThan(-1);
      expect(isStaffIdx).toBeGreaterThan(lockIdx);
      const al001Matches = body.match(/USING ERRCODE = 'AL001'/g) ?? [];
      expect(al001Matches.length).toBe(3); // auth.uid() NULL, profile not found, is_staff() false
    }
  });

  it("the caller-authorization section of every function never duplicates is_staff()'s role/is_active check locally", () => {
    for (const fn of FN_NAMES) {
      const body = extractFunctionBody(contents, fn);
      const authSection = body.slice(0, body.indexOf("IF public.is_staff() IS NOT TRUE THEN") + 100);
      expect(authSection).not.toMatch(/v_caller_role/);
      expect(authSection).not.toMatch(/v_caller_is_active/);
      expect(authSection).not.toMatch(/p\.role/);
      expect(authSection).not.toMatch(/p\.is_active/);
    }
  });
});

describe("Task 026 Phase 1 — issue_review_link", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "issue_review_link");

  it("locks the target Project row FOR KEY SHARE, not FOR UPDATE (minimal sufficient lock)", () => {
    expect(fnBody).toMatch(/FROM public\.projects AS p\s*\n\s*WHERE p\.id = p_project_id\s*\n\s*FOR KEY SHARE;/);
    expect(fnBody).not.toMatch(/FROM public\.projects AS p\s*\n\s*WHERE p\.id = p_project_id\s*\n\s*FOR UPDATE;/);
  });

  it("raises AL002 when the Project is not found", () => {
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Project not found'\s*\n\s*USING ERRCODE = 'AL002';/);
  });

  it("always inserts link_type = 'REVIEW' (never a client-supplied link_type)", () => {
    const insertMatch = fnBody.match(/INSERT INTO public\.project_access_links \([\s\S]*?\) VALUES \(([\s\S]*?)\)\s*\n\s*RETURNING/);
    expect(insertMatch).not.toBeNull();
    expect(insertMatch![1]).toMatch(/'REVIEW'/);
    expect(fnBody).not.toMatch(/p_link_type/);
  });

  it("never revokes any existing link (no UPDATE statement anywhere in this function)", () => {
    expect(fnBody).not.toMatch(/UPDATE public\.project_access_links/);
    expect(fnBody).not.toMatch(/revoked_at\s*=/);
  });

  it("inserts exactly once (no batch/loop insert)", () => {
    const insertMatches = fnBody.match(/INSERT INTO public\.project_access_links/g) ?? [];
    expect(insertMatches.length).toBe(1);
  });

  it("logs exactly one REVIEW_LINK_ISSUED activity row", () => {
    const logCalls = fnBody.match(/PERFORM public\.log_activity\(/g) ?? [];
    expect(logCalls).toHaveLength(1);
    expect(fnBody).toMatch(/'REVIEW_LINK_ISSUED'/);
  });

  it("activity metadata contains only access_link_id/link_type — never token_hash/token_hint/raw token", () => {
    const metadataMatch = fnBody.match(/PERFORM public\.log_activity\(([\s\S]*?)\);/);
    expect(metadataMatch).not.toBeNull();
    const metadataArg = metadataMatch![1];
    expect(metadataArg).toMatch(/'access_link_id', v_result\.id/);
    expect(metadataArg).toMatch(/'link_type', v_result\.link_type/);
    expect(metadataArg).not.toMatch(/token_hash|token_hint|p_token_hash|p_token_hint/);
  });

  it("never returns token_hash in its RETURNS TABLE or final SELECT", () => {
    const returnsMatch = contents.match(/CREATE FUNCTION public\.issue_review_link\([\s\S]*?RETURNS TABLE \(([\s\S]*?)\)\s*\nLANGUAGE/);
    expect(returnsMatch).not.toBeNull();
    expect(returnsMatch![1]).not.toMatch(/token_hash/);
    expect(fnBody).not.toMatch(/RETURN QUERY SELECT[\s\S]*token_hash/);
  });

  it("the activity call happens after the mutating INSERT (no log before a real mutation)", () => {
    const insertIdx = fnBody.indexOf("INSERT INTO public.project_access_links");
    const logIdx = fnBody.indexOf("PERFORM public.log_activity(");
    expect(insertIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeGreaterThan(insertIdx);
  });
});

describe("Task 026 Phase 1 — rotate_access_link", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "rotate_access_link");

  it("locks the exact source row FOR UPDATE, matched on BOTH id and project_id", () => {
    expect(fnBody).toMatch(
      /FROM public\.project_access_links AS p\s*\n\s*WHERE p\.id = p_access_link_id\s*\n\s*AND p\.project_id = p_project_id\s*\n\s*FOR UPDATE;/,
    );
  });

  it("raises AL003 when the source row is not found", () => {
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Access link not found'\s*\n\s*USING ERRCODE = 'AL003';/);
  });

  it("raises AL004 when already revoked, checked before AL005 (expiry)", () => {
    const al004Idx = fnBody.indexOf("USING ERRCODE = 'AL004'");
    const al005Idx = fnBody.indexOf("USING ERRCODE = 'AL005'");
    expect(al004Idx).toBeGreaterThan(-1);
    expect(al005Idx).toBeGreaterThan(-1);
    expect(al004Idx).toBeLessThan(al005Idx);
    expect(fnBody).toMatch(/IF v_source_revoked_at IS NOT NULL THEN/);
  });

  it("raises AL005 when expires_at is non-NULL and <= now()", () => {
    expect(fnBody).toMatch(
      /IF v_source_expires_at IS NOT NULL AND v_source_expires_at <= now\(\) THEN/,
    );
  });

  it("revokes exactly the source row (UPDATE WHERE id = p_access_link_id, no project_id-only or type-wide WHERE)", () => {
    const updateMatch = fnBody.match(/UPDATE public\.project_access_links AS p SET\s*\n\s*revoked_at = now\(\)\s*\n\s*WHERE p\.id = p_access_link_id;/);
    expect(updateMatch).not.toBeNull();
  });

  it("inserts exactly one replacement row preserving project_id, link_type, and expires_at from the source", () => {
    const insertMatch = fnBody.match(/INSERT INTO public\.project_access_links \([\s\S]*?\) VALUES \(([\s\S]*?)\)\s*\n\s*RETURNING/);
    expect(insertMatch).not.toBeNull();
    const values = insertMatch![1];
    expect(values).toMatch(/p_project_id/);
    expect(values).toMatch(/v_source_link_type/);
    expect(values).toMatch(/v_source_expires_at/);
    expect(values).toMatch(/p_new_token_hash/);
    expect(values).toMatch(/p_new_token_hint/);
  });

  it("touches no sibling link of the same type (no query/update against any row other than p_access_link_id and the one new INSERT)", () => {
    const selects = fnBody.match(/FROM public\.project_access_links/g) ?? [];
    expect(selects.length).toBe(1); // only the source-row lock SELECT
    const updates = fnBody.match(/UPDATE public\.project_access_links/g) ?? [];
    expect(updates.length).toBe(1); // only the source-row revoke
  });

  it("logs exactly one ACCESS_LINK_ROTATED activity row with old/new ids and link_type, no token material", () => {
    const logCalls = fnBody.match(/PERFORM public\.log_activity\(/g) ?? [];
    expect(logCalls).toHaveLength(1);
    const metadataMatch = fnBody.match(/PERFORM public\.log_activity\(([\s\S]*?)\);/);
    expect(metadataMatch).not.toBeNull();
    const metadataArg = metadataMatch![1];
    expect(fnBody).toMatch(/'ACCESS_LINK_ROTATED'/);
    expect(metadataArg).toMatch(/'old_access_link_id', p_access_link_id/);
    expect(metadataArg).toMatch(/'new_access_link_id', v_result\.id/);
    expect(metadataArg).toMatch(/'link_type', v_result\.link_type/);
    expect(metadataArg).not.toMatch(/token_hash|token_hint|p_new_token_hash|p_new_token_hint/);
  });

  it("never returns token_hash", () => {
    const returnsMatch = contents.match(/CREATE FUNCTION public\.rotate_access_link\([\s\S]*?RETURNS TABLE \(([\s\S]*?)\)\s*\nLANGUAGE/);
    expect(returnsMatch).not.toBeNull();
    expect(returnsMatch![1]).not.toMatch(/token_hash/);
  });

  it("the revoke-then-insert-then-log ordering is correct (revoke before insert, insert before log)", () => {
    const updateIdx = fnBody.indexOf("UPDATE public.project_access_links");
    const insertIdx = fnBody.indexOf("INSERT INTO public.project_access_links");
    const logIdx = fnBody.indexOf("PERFORM public.log_activity(");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(updateIdx);
    expect(logIdx).toBeGreaterThan(insertIdx);
  });
});

describe("Task 026 Phase 1 — revoke_access_link", () => {
  const contents = readMigration();
  const fnBody = extractFunctionBody(contents, "revoke_access_link");

  it("locks the exact target row FOR UPDATE, matched on BOTH id and project_id", () => {
    expect(fnBody).toMatch(
      /FROM public\.project_access_links AS p\s*\n\s*WHERE p\.id = p_access_link_id\s*\n\s*AND p\.project_id = p_project_id\s*\n\s*FOR UPDATE;/,
    );
  });

  it("raises AL003 when not found, AL004 when already revoked", () => {
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Access link not found'\s*\n\s*USING ERRCODE = 'AL003';/);
    expect(fnBody).toMatch(/RAISE EXCEPTION 'Access link is already revoked'\s*\n\s*USING ERRCODE = 'AL004';/);
  });

  it("never checks expires_at — an expired-but-not-revoked link may still be revoked (D9)", () => {
    expect(fnBody).not.toMatch(/expires_at/);
    expect(fnBody).not.toMatch(/USING ERRCODE = 'AL005'/);
  });

  it("sets revoked_at = now() on exactly the target row, no un-revoke path", () => {
    expect(fnBody).toMatch(
      /UPDATE public\.project_access_links AS p SET\s*\n\s*revoked_at = now\(\)\s*\n\s*WHERE p\.id = p_access_link_id/,
    );
    expect(fnBody).not.toMatch(/revoked_at = NULL/);
  });

  it("logs exactly one ACCESS_LINK_REVOKED activity row with access_link_id/link_type only, no token material", () => {
    const logCalls = fnBody.match(/PERFORM public\.log_activity\(/g) ?? [];
    expect(logCalls).toHaveLength(1);
    expect(fnBody).toMatch(/'ACCESS_LINK_REVOKED'/);
    const metadataMatch = fnBody.match(/PERFORM public\.log_activity\(([\s\S]*?)\);/);
    expect(metadataMatch).not.toBeNull();
    const metadataArg = metadataMatch![1];
    expect(metadataArg).toMatch(/'access_link_id', v_result\.id/);
    expect(metadataArg).toMatch(/'link_type', v_result\.link_type/);
    expect(metadataArg).not.toMatch(/token_hash|token_hint/);
  });

  it("the activity call happens after the mutating UPDATE", () => {
    const updateIdx = fnBody.indexOf("UPDATE public.project_access_links");
    const logIdx = fnBody.indexOf("PERFORM public.log_activity(");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(logIdx).toBeGreaterThan(updateIdx);
  });
});

describe("Task 026 Phase 1 — no new activity action invented (frozen union, docs/API_CONTRACT.md §6)", () => {
  const contents = readMigration();

  // Hand-copied from the frozen union — this migration must use only
  // actions that already exist there (REVIEW_LINK_ISSUED, ACCESS_LINK_ROTATED,
  // ACCESS_LINK_REVOKED), never invent a new one such as
  // INTAKE_LINK_ISSUED/PORTAL_LINK_ISSUED/ACCESS_LINK_ISSUED/GUEST_TOKEN_ROTATED
  // (all explicitly excluded by §6/§7.4/§7.5).
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

  it("every action string passed to log_activity in this migration is in the frozen union", () => {
    const logCalls = [...contents.matchAll(/PERFORM public\.log_activity\(\s*\n\s*p_project_id,\s*\n\s*'STAFF',\s*\n\s*'([A-Z_]+)'/g)];
    expect(logCalls.length).toBe(3);
    for (const match of logCalls) {
      expect(FROZEN_UNION).toContain(match[1]);
    }
  });

  it("uses exactly REVIEW_LINK_ISSUED, ACCESS_LINK_ROTATED, ACCESS_LINK_REVOKED — no others", () => {
    const logCalls = [...contents.matchAll(/PERFORM public\.log_activity\(\s*\n\s*p_project_id,\s*\n\s*'STAFF',\s*\n\s*'([A-Z_]+)'/g)];
    const actions = logCalls.map((m) => m[1]).sort();
    expect(actions).toEqual(["ACCESS_LINK_REVOKED", "ACCESS_LINK_ROTATED", "REVIEW_LINK_ISSUED"].sort());
  });

  it("never invents INTAKE_LINK_ISSUED / PORTAL_LINK_ISSUED / ACCESS_LINK_ISSUED / GUEST_TOKEN_ROTATED", () => {
    expect(contents).not.toMatch(/INTAKE_LINK_ISSUED/);
    expect(contents).not.toMatch(/PORTAL_LINK_ISSUED/);
    expect(contents).not.toMatch(/'ACCESS_LINK_ISSUED'/);
    expect(contents).not.toMatch(/GUEST_TOKEN_ROTATED/);
  });
});

describe("Task 026 Phase 1 — REVIEW INSERT RLS tightening", () => {
  const contents = readMigration();

  it("drops and recreates project_access_links_insert_staff exactly once each", () => {
    expect(contents).toMatch(/DROP POLICY project_access_links_insert_staff ON public\.project_access_links;/);
    const createMatches = contents.match(/CREATE POLICY project_access_links_insert_staff/g) ?? [];
    expect(createMatches.length).toBe(1);
    const dropIdx = contents.indexOf("DROP POLICY project_access_links_insert_staff");
    const createIdx = contents.indexOf("CREATE POLICY project_access_links_insert_staff");
    expect(dropIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(dropIdx);
  });

  it("the recreated policy is FOR INSERT TO authenticated with is_staff(), link_type restricted to INTAKE/PORTAL, created_by bound to auth.uid(), and revoked_at/last_used_at forced NULL", () => {
    const policyMatch = contents.match(
      /CREATE POLICY project_access_links_insert_staff\s*\n\s*ON public\.project_access_links\s*\n\s*FOR INSERT\s*\n\s*TO authenticated\s*\n\s*WITH CHECK \(([\s\S]*?)\);/,
    );
    expect(policyMatch).not.toBeNull();
    const checkExpr = policyMatch![1];
    expect(checkExpr).toMatch(/public\.is_staff\(\)/);
    expect(checkExpr).toMatch(/link_type IN \('INTAKE', 'PORTAL'\)/);
    expect(checkExpr).toMatch(/created_by = auth\.uid\(\)/);
    expect(checkExpr).toMatch(/revoked_at IS NULL/);
    expect(checkExpr).toMatch(/last_used_at IS NULL/);
    expect(checkExpr).not.toMatch(/REVIEW/);
  });

  it("does not add an anon INSERT policy", () => {
    expect(contents).not.toMatch(/CREATE POLICY[^;]*\n\s*ON public\.project_access_links\s*\n\s*FOR INSERT\s*\n\s*TO anon/);
  });

  it("does not touch the SELECT policy", () => {
    expect(contents).not.toMatch(/DROP POLICY project_access_links_select_staff/);
    expect(contents).not.toMatch(/CREATE POLICY project_access_links_select_staff/);
  });

  it("does not touch the UPDATE RLS policy (only its column-level table privilege is tightened, separately)", () => {
    expect(contents).not.toMatch(/DROP POLICY project_access_links_update_staff/);
    expect(contents).not.toMatch(/CREATE POLICY project_access_links_update_staff/);
  });
});

describe("Task 026 Phase 1 — UPDATE privilege tightening", () => {
  const contents = readMigration();

  it("revokes table-wide UPDATE on project_access_links from authenticated", () => {
    expect(contents).toMatch(/REVOKE UPDATE ON TABLE public\.project_access_links FROM authenticated;/);
  });

  it("re-grants column-level UPDATE for exactly expires_at, excluding revoked_at and last_used_at", () => {
    const grantMatch = contents.match(
      /GRANT UPDATE \(([^()]*)\) ON TABLE public\.project_access_links TO authenticated;/,
    );
    expect(grantMatch).not.toBeNull();
    const columns = grantMatch![1]
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    expect(columns).toEqual(["expires_at"]);
  });

  it("the REVOKE precedes the re-GRANT", () => {
    const revokeIdx = contents.indexOf("REVOKE UPDATE ON TABLE public.project_access_links FROM authenticated;");
    const grantIdx = contents.indexOf("GRANT UPDATE (expires_at) ON TABLE public.project_access_links TO authenticated;");
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(revokeIdx);
  });

  it("never grants any project_access_links privilege to anon or PUBLIC", () => {
    expect(contents).not.toMatch(/GRANT[^;]*ON TABLE public\.project_access_links[^;]*TO anon/);
    expect(contents).not.toMatch(/GRANT[^;]*ON TABLE public\.project_access_links[^;]*TO PUBLIC/);
  });

  it("never grants DELETE on project_access_links to any role", () => {
    expect(contents).not.toMatch(/GRANT[^;]*DELETE[^;]*ON TABLE public\.project_access_links/);
  });
});

describe("Task 026 Phase 1 — authenticated INSERT column-privilege tightening", () => {
  const contents = readMigration();

  it("revokes table-wide INSERT on project_access_links from authenticated", () => {
    expect(contents).toMatch(/REVOKE INSERT ON TABLE public\.project_access_links FROM authenticated;/);
  });

  it("re-grants column-level INSERT for exactly the six issuance columns", () => {
    const grantMatch = contents.match(
      /GRANT INSERT \(([^()]*)\) ON TABLE public\.project_access_links TO authenticated;/,
    );
    expect(grantMatch).not.toBeNull();
    const columns = grantMatch![1]
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    expect(columns.sort()).toEqual(
      ["project_id", "link_type", "token_hash", "token_hint", "expires_at", "created_by"].sort(),
    );
  });

  it("never grants INSERT privilege on id, created_at, revoked_at, or last_used_at to authenticated", () => {
    const grantMatch = contents.match(
      /GRANT INSERT \(([^()]*)\) ON TABLE public\.project_access_links TO authenticated;/,
    );
    expect(grantMatch).not.toBeNull();
    const columns = grantMatch![1]
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    expect(columns).not.toContain("id");
    expect(columns).not.toContain("created_at");
    expect(columns).not.toContain("revoked_at");
    expect(columns).not.toContain("last_used_at");
  });

  it("the INSERT REVOKE precedes the re-GRANT", () => {
    const revokeIdx = contents.indexOf("REVOKE INSERT ON TABLE public.project_access_links FROM authenticated;");
    const grantIdx = contents.indexOf("GRANT INSERT (", revokeIdx);
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(revokeIdx);
  });
});

describe("Task 026 Phase 1 — service_role UPDATE column-privilege tightening", () => {
  const contents = readMigration();

  it("revokes table-wide UPDATE on project_access_links from service_role", () => {
    expect(contents).toMatch(/REVOKE UPDATE ON TABLE public\.project_access_links FROM service_role;/);
  });

  it("re-grants column-level UPDATE for exactly last_used_at, excluding every other column", () => {
    const grantMatch = contents.match(
      /GRANT UPDATE \(([^()]*)\) ON TABLE public\.project_access_links TO service_role;/,
    );
    expect(grantMatch).not.toBeNull();
    const columns = grantMatch![1]
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    expect(columns).toEqual(["last_used_at"]);
  });

  it("the service_role UPDATE REVOKE precedes the re-GRANT", () => {
    const revokeIdx = contents.indexOf("REVOKE UPDATE ON TABLE public.project_access_links FROM service_role;");
    const grantIdx = contents.indexOf("GRANT UPDATE (last_used_at) ON TABLE public.project_access_links TO service_role;");
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(revokeIdx);
  });

  it("service_role SELECT privilege is untouched (no GRANT/REVOKE of SELECT for service_role) — matched per-line, anchored to an actual statement (not comment prose)", () => {
    expect(contents).not.toMatch(/^GRANT[^\n]*SELECT[^\n]*TO service_role;/m);
    expect(contents).not.toMatch(/^REVOKE[^\n]*SELECT[^\n]*FROM service_role;/m);
  });

  it("never grants service_role INSERT or DELETE on project_access_links (matched per-line, anchored to an actual statement)", () => {
    expect(contents).not.toMatch(/^GRANT[^\n]*INSERT[^\n]*TO service_role;/m);
    expect(contents).not.toMatch(/^GRANT[^\n]*DELETE[^\n]*TO service_role;/m);
  });

  it("never grants service_role EXECUTE on any of the three Task 026 functions", () => {
    for (const fn of FN_NAMES) {
      expect(contents).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^;]*TO service_role`));
    }
  });
});
