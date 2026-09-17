import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security review checks for Task 023 (task spec §12), mirroring
 * lib/server/wedding-details/__tests__/static-security-review.test.ts
 * (Task 022): the Project Events route/service/gateway code must never
 * reference `service_role`, must never call `log_activity` directly (it is
 * reachable only from inside the create_project_event/update_project_event/
 * delete_project_event SQL functions), must never issue a direct
 * project_events INSERT/UPDATE/DELETE (canonical mutations must go only
 * through those RPCs), and the migration itself must revoke the
 * `authenticated` INSERT/UPDATE/DELETE table privileges that would
 * otherwise let a direct write bypass the audited business actions.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");

const FILES_UNDER_REVIEW = [
  "lib/server/project-events/list-project-events.ts",
  "lib/server/project-events/create-project-event.ts",
  "lib/server/project-events/update-project-event.ts",
  "lib/server/project-events/delete-project-event.ts",
  "lib/server/project-events/project-events-gateway.ts",
  "lib/server/project-events/validate-project-event-input.ts",
  "lib/server/project-events/project-events-types.ts",
  "lib/server/project-events/project-events-rpc-error-codes.ts",
  "lib/server/supabase/project-events-repository.ts",
  "lib/server/routes/project-events.ts",
  "app/api/v2/internal/projects/[id]/events/route.ts",
  "app/api/v2/internal/projects/[id]/events/[eventId]/route.ts",
];

const MIGRATION_PATH = "supabase/migrations/20260911041142_0022_project_events_actions.sql";
const MIGRATION_0009_PATH = "supabase/migrations/20260911041128_0009_project_events.sql";

/**
 * Extracts the exact name of the partial unique index on
 * project_events (project_id, side) WHERE is_primary = true, directly from
 * migration 0009 — never hardcoded/assumed independently here, per the SQL
 * review instruction "do not assume the comment is correct."
 */
function extractOnePrimaryIndexName(migration0009Contents: string): string {
  const match = migration0009Contents.match(
    /CREATE UNIQUE INDEX (\S+)\s+ON public\.project_events \(project_id, side\)\s+WHERE is_primary = true;/,
  );
  if (!match) {
    throw new Error(
      "Could not find the (project_id, side) WHERE is_primary partial unique index in migration 0009",
    );
  }
  return match[1];
}

/** Slices out one CREATE FUNCTION public.<fnName>(...) ... $$; body. */
function extractFunctionBody(migrationContents: string, fnName: string): string {
  const start = migrationContents.indexOf(`CREATE FUNCTION public.${fnName}(`);
  expect(start).toBeGreaterThan(-1);
  const end = migrationContents.indexOf(`COMMENT ON FUNCTION public.${fnName}(`, start);
  expect(end).toBeGreaterThan(start);
  return migrationContents.slice(start, end);
}

/**
 * Slices out the `WHEN unique_violation THEN ... RAISE;` handler from a
 * function body — bounded from the WHEN clause through the first
 * subsequent bare `RAISE;`, which is the handler's last statement by
 * construction (SQL review patch §3).
 */
function extractUniqueViolationHandler(fnBody: string): string {
  const start = fnBody.indexOf("WHEN unique_violation THEN");
  expect(start).toBeGreaterThan(-1);
  const raiseIdx = fnBody.indexOf("RAISE;", start);
  expect(raiseIdx).toBeGreaterThan(-1);
  return fnBody.slice(start, raiseIdx + "RAISE;".length);
}

describe("Task 023 static/security review", () => {
  it.each(FILES_UNDER_REVIEW)("%s never references service_role", (relativePath) => {
    const contents = readFileSync(join(ROOT, relativePath), "utf8");
    expect(contents).not.toMatch(/service_role/i);
  });

  it.each(FILES_UNDER_REVIEW)("%s never calls log_activity directly", (relativePath) => {
    const contents = readFileSync(join(ROOT, relativePath), "utf8");
    expect(contents).not.toMatch(/log_activity/);
  });

  it("project-events-repository.ts never issues a direct project_events INSERT, UPDATE, or DELETE", () => {
    const contents = readFileSync(
      join(ROOT, "lib/server/supabase/project-events-repository.ts"),
      "utf8",
    );
    expect(contents).not.toMatch(/\.insert\s*\(/);
    expect(contents).not.toMatch(/\.update\s*\(/);
    expect(contents).not.toMatch(/\.delete\s*\(/);
  });

  it("project-events-repository.ts's mutations call only the create/update/delete_project_event RPCs", () => {
    const contents = readFileSync(
      join(ROOT, "lib/server/supabase/project-events-repository.ts"),
      "utf8",
    );
    expect(contents).toMatch(/client\.rpc\(\s*["']create_project_event["']/);
    expect(contents).toMatch(/client\.rpc\(\s*["']update_project_event["']/);
    expect(contents).toMatch(/client\.rpc\(\s*["']delete_project_event["']/);
  });

  it("the migration revokes authenticated INSERT/UPDATE/DELETE on project_events (audited-only enforcement)", () => {
    const contents = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");
    expect(contents).toMatch(
      /REVOKE\s+INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.project_events\s+FROM\s+authenticated\s*;/,
    );
  });

  it("the migration authorizes every function via public.is_staff() and does not duplicate a local role/is_active check", () => {
    const contents = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");

    // Centralized authorization helper (docs/SECURITY.md §5.1) is actually
    // called as an executable condition in all three functions, not merely
    // mentioned in prose.
    const matches = contents.match(/IF\s+public\.is_staff\(\)\s+IS\s+NOT\s+TRUE\s+THEN/g);
    expect(matches?.length).toBe(3);

    // No independent local predicate re-implementing is_staff()'s own
    // role/is_active logic.
    expect(contents).not.toMatch(/v_caller_role/);
    expect(contents).not.toMatch(/v_caller_is_active/);
    expect(contents).not.toMatch(/p\.role/);
    expect(contents).not.toMatch(/p\.is_active/);
  });

  it("every business action function is SECURITY DEFINER with SET search_path = ''", () => {
    const contents = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");

    for (const fn of ["create_project_event", "update_project_event", "delete_project_event"]) {
      const fnStart = contents.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(fnStart).toBeGreaterThan(-1);
      const fnBody = contents.slice(fnStart, fnStart + 1500);
      expect(fnBody).toMatch(/SECURITY DEFINER/);
      expect(fnBody).toMatch(/SET search_path = ''/);
    }
  });

  it("only authenticated is granted EXECUTE on the three business actions (never anon/service_role/PUBLIC)", () => {
    const contents = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");

    const grantMatches = contents.match(/GRANT EXECUTE ON FUNCTION[^;]+;/g) ?? [];
    expect(grantMatches.length).toBe(3);
    for (const grant of grantMatches) {
      expect(grant).toMatch(/TO authenticated/);
      expect(grant).not.toMatch(/anon|service_role|PUBLIC/);
    }
  });
});

/**
 * SQL review patch (Task 023): create_project_event() and
 * update_project_event() must translate ONLY the
 * project_events_one_primary_per_project_side_idx (0009) unique_violation
 * to PE005 — every other unique_violation must fall through unchanged (bare
 * RAISE) to the generic unrecognized-SQLSTATE -> HTTP 500 path, never be
 * pre-translated.
 */
describe("Task 023 SQL review patch — PE005 unique_violation narrowing", () => {
  it("the exact 0009 partial unique index name matches what the migration's comments claim", () => {
    const migration0009Contents = readFileSync(join(ROOT, MIGRATION_0009_PATH), "utf8");
    const indexName = extractOnePrimaryIndexName(migration0009Contents);

    expect(indexName).toBe("project_events_one_primary_per_project_side_idx");
  });

  it.each(["create_project_event", "update_project_event"])(
    "%s's unique_violation handler checks CONSTRAINT_NAME via GET STACKED DIAGNOSTICS before raising PE005",
    (fnName) => {
      const migrationContents = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");
      const migration0009Contents = readFileSync(join(ROOT, MIGRATION_0009_PATH), "utf8");
      const indexName = extractOnePrimaryIndexName(migration0009Contents);

      const fnBody = extractFunctionBody(migrationContents, fnName);
      const handler = extractUniqueViolationHandler(fnBody);

      // Reads the actual caught constraint/index name via the standard
      // PL/pgSQL mechanism — never assumes every unique_violation is the
      // one intended index.
      expect(handler).toMatch(/GET STACKED DIAGNOSTICS\s+\w+\s*=\s*CONSTRAINT_NAME\s*;/);

      // PE005 is raised only inside an IF gated on the exact 0009 index
      // name (read dynamically above, not hardcoded independently).
      const ifGuardPattern = new RegExp(
        `IF\\s+\\w+\\s*=\\s*'${indexName}'\\s+THEN[\\s\\S]*?ERRCODE\\s*=\\s*'PE005'`,
      );
      expect(handler).toMatch(ifGuardPattern);

      // The handler's last statement is a bare re-raise of the original
      // exception for every unique_violation that is NOT the intended
      // index — this is what extractUniqueViolationHandler's bounding
      // already guarantees exists, asserted again explicitly here.
      expect(handler.trimEnd().endsWith("RAISE;")).toBe(true);

      // The bare RAISE must be reachable independently of the PE005
      // branch — i.e. it sits after the IF...END IF closes, not inside it
      // — otherwise every non-matching unique_violation would fall through
      // with no exception raised at all instead of being re-raised.
      const ifBlockEnd = handler.search(/END IF;/);
      const bareRaiseIndex = handler.lastIndexOf("RAISE;");
      expect(ifBlockEnd).toBeGreaterThan(-1);
      expect(bareRaiseIndex).toBeGreaterThan(ifBlockEnd);
    },
  );

  it.each(["create_project_event", "update_project_event"])(
    "%s does not raise PE005 for every unique_violation unconditionally (no bare 'WHEN unique_violation THEN RAISE EXCEPTION ... PE005' with no CONSTRAINT_NAME check)",
    (fnName) => {
      const migrationContents = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");
      const fnBody = extractFunctionBody(migrationContents, fnName);
      const handler = extractUniqueViolationHandler(fnBody);

      // The regression this patch fixes: WHEN unique_violation THEN
      // immediately followed by RAISE EXCEPTION ... PE005 with no
      // GET STACKED DIAGNOSTICS / CONSTRAINT_NAME check in between.
      expect(handler).not.toMatch(
        /WHEN unique_violation THEN\s*(?:--[^\n]*\n\s*)*RAISE EXCEPTION[^;]*PE005/,
      );
    },
  );
});
