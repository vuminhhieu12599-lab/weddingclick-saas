import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security review checks for Invitation Rendering Foundation
 * checkpoint RF-L01 (migration 0027_project_events_lunar_date_display.sql)
 * — mirrors the review style of static-security-review.test.ts (Task 023,
 * which stays pinned to migration 0022): read the actual migration text and
 * assert on it directly, never assume its contents.
 *
 * Frozen contract (docs/DECISIONS.md RF6 / RF17 "RF-L01 scope"): add
 * nullable project_events.lunar_date_display with no default and NO
 * backfill; wedding_details.lunar_date_display untouched; redefine
 * create_project_event/update_project_event by dropping the exact 0022
 * signatures (no stale overload) with every 0022 security/locking/logging/
 * error-translation property preserved; delete_project_event unchanged.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const MIGRATION_FILENAME = "20260911041147_0027_project_events_lunar_date_display.sql";
const MIGRATION_PATH = join(MIGRATIONS_DIR, MIGRATION_FILENAME);
const MIGRATION_0022_PATH = join(MIGRATIONS_DIR, "20260911041142_0022_project_events_actions.sql");

const FUNCTIONS = ["create_project_event", "update_project_event"] as const;
type RedefinedFunction = (typeof FUNCTIONS)[number];

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

/**
 * Removes `--` line comments and single-quoted string literals so
 * assertions only see executable SQL — prose in comments and the
 * COMMENT ON ... IS '...' text may legitimately mention
 * wedding_details/backfill.
 */
function stripCommentsAndLiterals(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (sql[i] === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      out += "''";
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/** Executable SQL outside every `AS $$ ... $$;` function body. */
function topLevelStatements(sql: string): string {
  return stripCommentsAndLiterals(sql).replace(/\$\$[\s\S]*?\$\$/g, "$$$$");
}

/** Slices out one CREATE FUNCTION public.<fnName>(...) ... $$; definition. */
function extractFunctionDefinition(contents: string, fnName: string): string {
  const start = contents.indexOf(`CREATE FUNCTION public.${fnName}(`);
  expect(start).toBeGreaterThan(-1);
  const end = contents.indexOf(`COMMENT ON FUNCTION public.${fnName}(`, start);
  expect(end).toBeGreaterThan(start);
  return contents.slice(start, end);
}

/** The `(name type, ...)` parameter list of a CREATE FUNCTION definition. */
function extractParameterList(definition: string): string {
  const open = definition.indexOf("(");
  const close = definition.indexOf("\n)", open);
  expect(close).toBeGreaterThan(open);
  return definition.slice(open + 1, close);
}

/** Ordered `[name, type]` pairs from the RETURNS TABLE (...) clause. */
function extractReturnsTable(definition: string): Array<[string, string]> {
  const match = definition.match(/RETURNS TABLE \(([\s\S]*?)\n\)/);
  expect(match).not.toBeNull();
  return match![1]
    .split(",")
    .map((col) => col.trim())
    .filter(Boolean)
    .map((col) => {
      const [name, ...type] = col.split(/\s+/);
      return [name, type.join(" ")] as [string, string];
    });
}

/** Ordered projected expressions of the final `RETURN QUERY SELECT ...;`. */
function extractReturnQueryProjection(definition: string): string[] {
  const body = stripCommentsAndLiterals(definition);
  const match = body.match(/RETURN QUERY SELECT([\s\S]*?);/);
  expect(match).not.toBeNull();
  return match![1]
    .split(",")
    .map((expr) => expr.trim())
    .filter(Boolean);
}

/** The exact old input-argument type list, read from 0022's COMMENT ON FUNCTION. */
function extractOldSignature(fnName: RedefinedFunction): string {
  const contents0022 = readFileSync(MIGRATION_0022_PATH, "utf8");
  const match = contents0022.match(
    new RegExp(`COMMENT ON FUNCTION public\\.${fnName}\\(([^)]*)\\)`),
  );
  expect(match).not.toBeNull();
  return normalizeArgs(match![1]);
}

function normalizeArgs(args: string): string {
  return args
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .join(", ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function signaturePattern(fnName: string, args: string): string {
  return `public\\.${fnName}\\(\\s*${args
    .split(", ")
    .map(escapeRegExp)
    .join("\\s*,\\s*")}\\s*\\)`;
}

describe("RF-L01 — migration file placement", () => {
  it("0027_project_events_lunar_date_display.sql exists and sorts immediately after 0026", () => {
    const files = readdirSync(MIGRATIONS_DIR).sort();
    expect(files).toContain(MIGRATION_FILENAME);
    const idx0026 = files.findIndex((f) => f.includes("_0026_intake_actions"));
    expect(idx0026).toBeGreaterThan(-1);
    expect(files.indexOf(MIGRATION_FILENAME)).toBe(idx0026 + 1);
  });
});

describe("RF-L01 — schema change", () => {
  const topLevel = topLevelStatements(readMigration());

  it("adds exactly one column: nullable project_events.lunar_date_display TEXT with no default/generated/FK/CHECK", () => {
    const addColumns = topLevel.match(/ADD\s+COLUMN[^;]*;/gi) ?? [];
    expect(addColumns).toHaveLength(1);
    expect(topLevel).toMatch(
      /ALTER\s+TABLE\s+public\.project_events\s+ADD\s+COLUMN\s+lunar_date_display\s+TEXT\s*;/i,
    );
    const addColumn = addColumns[0];
    expect(addColumn).not.toMatch(/\bNOT\s+NULL\b/i);
    expect(addColumn).not.toMatch(/\bDEFAULT\b/i);
    expect(addColumn).not.toMatch(/\bGENERATED\b/i);
    expect(addColumn).not.toMatch(/\bREFERENCES\b/i);
    expect(addColumn).not.toMatch(/\bCHECK\b/i);
  });

  it("alters no other table, column, constraint, index, trigger, policy, or table privilege", () => {
    expect(topLevel.match(/ALTER\s+TABLE/gi) ?? []).toHaveLength(1);
    expect(topLevel).not.toMatch(/\bDROP\s+(COLUMN|TABLE|INDEX|TRIGGER|POLICY|CONSTRAINT)\b/i);
    expect(topLevel).not.toMatch(/\bALTER\s+COLUMN\b/i);
    expect(topLevel).not.toMatch(/\bCREATE\s+(UNIQUE\s+)?INDEX\b/i);
    expect(topLevel).not.toMatch(/\bCREATE\s+TRIGGER\b/i);
    expect(topLevel).not.toMatch(/\b(CREATE|ALTER)\s+POLICY\b/i);
    expect(topLevel).not.toMatch(/\bON\s+TABLE\b/i);
    expect(topLevel).not.toMatch(/\bCREATE\s+OR\s+REPLACE\b/i);
  });
});

describe("RF-L01 — no automatic lunar backfill (RF6)", () => {
  const contents = readMigration();
  const executable = stripCommentsAndLiterals(contents);
  const topLevel = topLevelStatements(contents);

  it("never references wedding_details in executable SQL (legacy column untouched, never copied)", () => {
    expect(executable).not.toMatch(/wedding_details/i);
  });

  it("issues no top-level UPDATE/INSERT data statement — existing rows stay NULL", () => {
    expect(topLevel).not.toMatch(/\bUPDATE\b/i);
    expect(topLevel).not.toMatch(/\bINSERT\b/i);
    expect(topLevel).not.toMatch(/\bDO\s+\$\$/i);
  });

  it("the only project_events UPDATE is inside update_project_event, scoped to the one target row", () => {
    const updates = executable.match(/UPDATE\s+public\.project_events\b[\s\S]*?;/gi) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatch(/WHERE\s+pe\.id\s*=\s*p_event_id\s+AND\s+pe\.project_id\s*=\s*p_project_id/);
    const updateDefinition = extractFunctionDefinition(contents, "update_project_event");
    expect(stripCommentsAndLiterals(updateDefinition)).toContain(updates[0]);
  });
});

describe("RF-L01 — exact old overloads removed, one new signature each", () => {
  const contents = readMigration();
  const executable = stripCommentsAndLiterals(contents);

  it.each(FUNCTIONS)("%s: DROPs the exact 0022 signature (no IF EXISTS, no CASCADE) before CREATE", (fnName) => {
    const oldArgs = extractOldSignature(fnName);
    const dropPattern = new RegExp(`DROP\\s+FUNCTION\\s+${signaturePattern(fnName, oldArgs)}\\s*;`);
    expect(executable).toMatch(dropPattern);

    const drops = executable.match(new RegExp(`DROP\\s+FUNCTION[^;]*\\b${fnName}\\b[^;]*;`, "g")) ?? [];
    expect(drops).toHaveLength(1);
    expect(drops[0]).not.toMatch(/IF\s+EXISTS|CASCADE/i);

    const dropIdx = executable.search(dropPattern);
    const createIdx = executable.indexOf(`CREATE FUNCTION public.${fnName}(`);
    expect(createIdx).toBeGreaterThan(dropIdx);
    expect(executable.split(`CREATE FUNCTION public.${fnName}(`)).toHaveLength(2);
  });

  it.each(FUNCTIONS)("%s: new signature is the 0022 signature plus one trailing text argument", (fnName) => {
    const newArgs = `${extractOldSignature(fnName)}, text`;
    const params = extractParameterList(extractFunctionDefinition(contents, fnName));
    const paramTypes = normalizeArgs(
      params
        .split(",")
        .map((p) => p.trim().split(/\s+/).slice(1).join(" "))
        .join(","),
    );
    expect(paramTypes).toBe(newArgs);
    expect(params.trim().split(/\s*,\s*/).at(-1)).toBe("p_lunar_date_display text");
  });

  it.each(FUNCTIONS)("%s: p_lunar_date_display is required — no parameter has a DEFAULT", (fnName) => {
    const params = extractParameterList(extractFunctionDefinition(contents, fnName));
    expect(params).not.toMatch(/\bDEFAULT\b|=/i);
  });

  it("does not drop or redefine delete_project_event", () => {
    expect(executable).not.toMatch(/delete_project_event/);
  });
});

describe("RF-L01 — lunar_date_display carried through create/update", () => {
  const contents = readMigration();

  it("create_project_event INSERTs p_lunar_date_display into lunar_date_display at matching positions", () => {
    const body = stripCommentsAndLiterals(extractFunctionDefinition(contents, "create_project_event"));
    const match = body.match(
      /INSERT INTO public\.project_events \(([\s\S]*?)\) VALUES \(([\s\S]*?)\)\s*RETURNING \* INTO v_result;/,
    );
    expect(match).not.toBeNull();
    const columns = match![1].split(",").map((c) => c.trim());
    const values = match![2].split(",").map((v) => v.trim());
    expect(values).toEqual(columns.map((c) => `p_${c}`));
    expect(columns).toContain("lunar_date_display");
  });

  it("update_project_event SETs lunar_date_display = p_lunar_date_display and never sets project_id/updated_at", () => {
    const body = stripCommentsAndLiterals(extractFunctionDefinition(contents, "update_project_event"));
    const match = body.match(/UPDATE public\.project_events AS pe SET([\s\S]*?)WHERE/);
    expect(match).not.toBeNull();
    const assignments = match![1].split(",").map((a) => a.trim());
    expect(assignments).toContain("lunar_date_display = p_lunar_date_display");
    for (const assignment of assignments) {
      const [column, value] = assignment.split(/\s*=\s*/);
      expect(value).toBe(`p_${column}`);
    }
    expect(assignments.map((a) => a.split(/\s*=/)[0])).not.toContain("project_id");
    expect(assignments.map((a) => a.split(/\s*=/)[0])).not.toContain("updated_at");
  });

  it("update_project_event change detection compares lunar_date_display, column-for-column with the SET list", () => {
    const body = stripCommentsAndLiterals(extractFunctionDefinition(contents, "update_project_event"));
    const match = body.match(/v_changed := \(([\s\S]*?)\) IS DISTINCT FROM \(([\s\S]*?)\);/);
    expect(match).not.toBeNull();
    const existing = match![1].split(",").map((e) => e.trim());
    const submitted = match![2].split(",").map((s) => s.trim());
    expect(existing).toContain("v_existing.lunar_date_display");
    expect(submitted).toContain("p_lunar_date_display");
    expect(submitted).toEqual(existing.map((e) => e.replace(/^v_existing\./, "p_")));

    const setMatch = body.match(/UPDATE public\.project_events AS pe SET([\s\S]*?)WHERE/);
    const setColumns = setMatch![1].split(",").map((a) => a.trim().split(/\s*=/)[0]);
    expect(existing.map((e) => e.replace(/^v_existing\./, ""))).toEqual(setColumns);
  });

  it("update_project_event logs CANONICAL_DATA_APPLIED only inside the IF v_changed branch", () => {
    const body = stripCommentsAndLiterals(extractFunctionDefinition(readMigration(), "update_project_event"));
    const changedBranch = body.slice(body.indexOf("IF v_changed THEN"), body.indexOf("ELSE\n    v_result := v_existing;"));
    expect(changedBranch).toMatch(/PERFORM public\.log_activity\(/);
    expect(body.match(/PERFORM public\.log_activity\(/g) ?? []).toHaveLength(1);
    expect(extractFunctionDefinition(readMigration(), "update_project_event")).toMatch(
      /'CANONICAL_DATA_APPLIED'/,
    );
  });
});

describe("RF-L01 — return shapes", () => {
  const contents = readMigration();
  const BASE_ROW: Array<[string, string]> = [
    ["id", "uuid"],
    ["project_id", "uuid"],
    ["occasion_type", "text"],
    ["side", "text"],
    ["title", "text"],
    ["starts_at", "timestamptz"],
    ["timezone", "text"],
    ["venue_name", "text"],
    ["address", "text"],
    ["map_url", "text"],
    ["description", "text"],
    ["sort_order", "integer"],
    ["is_primary", "boolean"],
    ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"],
    ["lunar_date_display", "text"],
  ];

  it("create_project_event RETURNS TABLE is the 0022 row shape plus lunar_date_display after updated_at", () => {
    expect(extractReturnsTable(extractFunctionDefinition(contents, "create_project_event"))).toEqual(BASE_ROW);
  });

  it("update_project_event RETURNS TABLE is the same row shape, then changed, operation", () => {
    expect(extractReturnsTable(extractFunctionDefinition(contents, "update_project_event"))).toEqual([
      ...BASE_ROW,
      ["changed", "boolean"],
      ["operation", "text"],
    ]);
  });

  it.each(FUNCTIONS)("%s: RETURN QUERY projects every declared column explicitly, in declared order", (fnName) => {
    const definition = extractFunctionDefinition(contents, fnName);
    const declared = extractReturnsTable(definition).map(([name]) => name);
    const projected = extractReturnQueryProjection(definition).map((expr) =>
      expr.replace(/^v_result\./, "").replace(/^v_changed$/, "changed").replace(/^v_operation$/, "operation"),
    );
    expect(projected).toEqual(declared);
    expect(definition).not.toMatch(/RETURN QUERY SELECT\s+v_result\.\*/);
  });
});

describe("RF-L01 — 0022 security/locking/error behavior preserved", () => {
  const contents = readMigration();

  it.each(FUNCTIONS)("%s is SECURITY DEFINER with SET search_path = '' and plpgsql", (fnName) => {
    const definition = extractFunctionDefinition(contents, fnName);
    const header = definition.slice(0, definition.indexOf("AS $$"));
    expect(header).toMatch(/LANGUAGE plpgsql/);
    expect(header).toMatch(/SECURITY DEFINER/);
    expect(header).toMatch(/SET search_path = ''/);
    expect(header).not.toMatch(/SECURITY INVOKER/);
  });

  it.each(FUNCTIONS)("%s authorizes via auth.uid(), a locked profiles row, and public.is_staff() before any data access", (fnName) => {
    const body = stripCommentsAndLiterals(extractFunctionDefinition(contents, fnName));
    const uidIdx = body.search(/IF auth\.uid\(\) IS NULL THEN/);
    const profileLockIdx = body.search(/FROM public\.profiles AS p\s+WHERE p\.id = auth\.uid\(\)\s+FOR UPDATE;/);
    const staffIdx = body.search(/IF public\.is_staff\(\) IS NOT TRUE THEN/);
    const projectLockIdx = body.search(/FROM public\.projects AS p\s+WHERE p\.id = p_project_id\s+FOR UPDATE;/);
    expect(uidIdx).toBeGreaterThan(-1);
    expect(profileLockIdx).toBeGreaterThan(uidIdx);
    expect(staffIdx).toBeGreaterThan(profileLockIdx);
    expect(projectLockIdx).toBeGreaterThan(staffIdx);
    expect(body).not.toMatch(/p\.role|p\.is_active|v_caller_role|v_caller_is_active/);
  });

  it("update_project_event locks the Project row before the Event row, scoped by id AND project_id", () => {
    const body = stripCommentsAndLiterals(extractFunctionDefinition(contents, "update_project_event"));
    const projectLockIdx = body.search(/FROM public\.projects AS p\s+WHERE p\.id = p_project_id\s+FOR UPDATE;/);
    const eventLockIdx = body.search(
      /FROM public\.project_events AS pe\s+WHERE pe\.id = p_event_id\s+AND pe\.project_id = p_project_id\s+FOR UPDATE;/,
    );
    expect(eventLockIdx).toBeGreaterThan(projectLockIdx);
    expect(projectLockIdx).toBeGreaterThan(-1);
  });

  it.each([
    ["create_project_event", ["PE001", "PE002", "PE003", "PE005"]],
    ["update_project_event", ["PE001", "PE002", "PE003", "PE004", "PE005"]],
  ] as const)("%s raises exactly its 0022 error codes", (fnName, codes) => {
    const definition = extractFunctionDefinition(contents, fnName);
    const raised = new Set(definition.match(/ERRCODE = '(PE\d{3})'/g)?.map((m) => m.slice(11, 16)));
    expect([...raised].sort()).toEqual([...codes]);
  });

  it.each(FUNCTIONS)("%s translates ONLY the one-primary index unique_violation to PE005, re-raising all others", (fnName) => {
    const definition = extractFunctionDefinition(contents, fnName);
    const start = definition.indexOf("WHEN unique_violation THEN");
    const end = definition.indexOf("RAISE;", start);
    expect(start).toBeGreaterThan(-1);
    const handler = definition.slice(start, end + "RAISE;".length);
    expect(handler).toMatch(/GET STACKED DIAGNOSTICS\s+\w+\s*=\s*CONSTRAINT_NAME\s*;/);
    expect(handler).toMatch(
      /IF\s+\w+\s*=\s*'project_events_one_primary_per_project_side_idx'\s+THEN[\s\S]*?ERRCODE\s*=\s*'PE005'[\s\S]*?END IF;\s*RAISE;$/,
    );
  });

  it.each([
    ["create_project_event", "Project event created", "'CREATED'"],
    ["update_project_event", "Project event updated", "v_operation"],
  ] as const)("%s logs CANONICAL_DATA_APPLIED with the unchanged 0022 actor/summary/details", (fnName, summary, operation) => {
    const definition = extractFunctionDefinition(contents, fnName);
    expect(definition).toMatch(
      new RegExp(
        `PERFORM public\\.log_activity\\(\\s*p_project_id,\\s*'STAFF',\\s*'CANONICAL_DATA_APPLIED',\\s*'${summary}',\\s*jsonb_build_object\\('domain', 'project_events', 'operation', ${operation}\\)\\s*\\);`,
      ),
    );
  });

  it("never references service_role inside a function body and never grants log_activity", () => {
    const executable = stripCommentsAndLiterals(contents);
    for (const fnName of FUNCTIONS) {
      const body = stripCommentsAndLiterals(extractFunctionDefinition(contents, fnName));
      expect(body).not.toMatch(/service_role/);
    }
    expect(executable).not.toMatch(/GRANT[^;]*log_activity/);
  });
});

describe("RF-L01 — COMMENT / REVOKE / GRANT recreated on the new signatures", () => {
  const contents = readMigration();
  const executable = stripCommentsAndLiterals(contents);

  it.each(FUNCTIONS)("%s: COMMENT ON FUNCTION targets the new signature", (fnName) => {
    const newArgs = `${extractOldSignature(fnName)}, text`;
    expect(executable).toMatch(new RegExp(`COMMENT ON FUNCTION ${signaturePattern(fnName, newArgs)} IS`));
  });

  it.each(FUNCTIONS)("%s: REVOKE ALL from PUBLIC, anon, authenticated, service_role on the new signature", (fnName) => {
    const newArgs = `${extractOldSignature(fnName)}, text`;
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(executable).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION ${signaturePattern(fnName, newArgs)} FROM ${role};`),
      );
    }
  });

  it("GRANTs EXECUTE only to authenticated, exactly once per new signature, and nothing else", () => {
    const grants = executable.match(/GRANT[^;]+;/g) ?? [];
    expect(grants).toHaveLength(2);
    for (const fnName of FUNCTIONS) {
      const newArgs = `${extractOldSignature(fnName)}, text`;
      const matching = grants.filter((g) =>
        new RegExp(`^GRANT EXECUTE ON FUNCTION ${signaturePattern(fnName, newArgs)} TO authenticated;$`).test(g),
      );
      expect(matching).toHaveLength(1);
    }
    for (const grant of grants) {
      expect(grant).not.toMatch(/\b(anon|service_role|PUBLIC)\b/);
    }
  });
});
