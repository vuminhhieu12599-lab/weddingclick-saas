import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { apiErrorStatus, type ApiErrorKind } from "../../errors/api-error";
import { SAVE_WEDDING_DETAILS_RPC_ERROR_CODES } from "../../wedding-details/wedding-details-rpc-error-codes";
import { INTAKE_RPC_ERROR_CODES } from "../intake-rpc-error-codes";

/**
 * Cross-checks the ISxxx error-code map (Task 027 Phase 1) against the
 * actual `USING ERRCODE = 'ISxxx'` strings raised by migration 0026, so the
 * map can never silently drift from what the database really raises —
 * mirrors lib/server/access-links/__tests__/access-link-rpc-error-codes.test.ts
 * (Task 026).
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATION_PATH = "supabase/migrations/20260911041146_0026_intake_actions.sql";

function readMigration(): string {
  return readFileSync(join(ROOT, MIGRATION_PATH), "utf8");
}

/** Every distinct ISxxx code the migration actually raises, in file order (may repeat). */
function extractRaisedCodes(contents: string): string[] {
  const matches = contents.matchAll(/USING ERRCODE = '(IS\d{3})'/g);
  return [...matches].map((m) => m[1]);
}

const KNOWN_KINDS: ApiErrorKind[] = [
  "BAD_REQUEST",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVARIANT",
  "EXPIRED_TOKEN",
  "REVOKED_TOKEN",
  "INTERNAL",
];

describe("INTAKE_RPC_ERROR_CODES shape", () => {
  const codes = Object.keys(INTAKE_RPC_ERROR_CODES);

  it("every key matches the ISxxx pattern", () => {
    for (const code of codes) {
      expect(code).toMatch(/^IS\d{3}$/);
    }
  });

  it("every entry has a known ApiErrorKind and a non-empty message", () => {
    for (const code of codes) {
      const entry = INTAKE_RPC_ERROR_CODES[code];
      expect(KNOWN_KINDS).toContain(entry.kind);
      expect(entry.message.length).toBeGreaterThan(0);
      // apiErrorStatus must not throw for any kind used here.
      expect(() => apiErrorStatus(entry.kind)).not.toThrow();
    }
  });

  it("no message contains raw SQL/Postgres wording", () => {
    for (const code of codes) {
      const message = INTAKE_RPC_ERROR_CODES[code].message;
      expect(message).not.toMatch(/SQLSTATE|constraint|relation|column ".*" of/i);
    }
  });

  it("no message reveals raw token/token_hash/token_hint material or customer payload/PII", () => {
    for (const code of codes) {
      const message = INTAKE_RPC_ERROR_CODES[code].message;
      expect(message).not.toMatch(/token_hash|token_hint|raw token/i);
    }
  });
});

describe("INTAKE_RPC_ERROR_CODES cross-referenced against migration 0026", () => {
  const contents = readMigration();
  const raisedCodes = new Set(extractRaisedCodes(contents));
  const mappedCodes = new Set(Object.keys(INTAKE_RPC_ERROR_CODES));

  it("the migration actually raises at least one ISxxx code", () => {
    expect(raisedCodes.size).toBeGreaterThan(0);
  });

  it("every code the migration raises is present in the map (no unmapped code silently falls through to HTTP 500)", () => {
    for (const code of raisedCodes) {
      expect(mappedCodes.has(code)).toBe(true);
    }
  });

  it("every code in the map is actually raised somewhere in the migration (no orphaned/unused mapping)", () => {
    for (const code of mappedCodes) {
      expect(raisedCodes.has(code)).toBe(true);
    }
  });

  it("the exact frozen code set is IS001, IS003 through IS008 — IS002 is an intentional gap (Finding A: removed auth.role() self-check, never renumbered)", () => {
    expect([...mappedCodes].sort()).toEqual(
      ["IS001", "IS003", "IS004", "IS005", "IS006", "IS007", "IS008"].sort(),
    );
    expect(mappedCodes.has("IS002")).toBe(false);
  });

  it.each([
    ["IS001", "FORBIDDEN"],
    ["IS003", "NOT_FOUND"],
    ["IS004", "NOT_FOUND"],
    ["IS005", "REVOKED_TOKEN"],
    ["IS006", "EXPIRED_TOKEN"],
    ["IS007", "NOT_FOUND"],
    ["IS008", "CONFLICT"],
  ])("%s maps to ApiError kind %s (frozen HTTP mapping)", (code, kind) => {
    expect(INTAKE_RPC_ERROR_CODES[code].kind).toBe(kind);
  });

  it("AL/PL/PE/WC/WD codes from other tasks never appear as keys in this map (distinct range, migration header ERROR CONTRACT)", () => {
    for (const code of mappedCodes) {
      expect(code).not.toMatch(/^AL\d{3}$/);
      expect(code).not.toMatch(/^PL\d{3}$/);
      expect(code).not.toMatch(/^PE\d{3}$/);
      expect(code).not.toMatch(/^WC\d{3}$/);
      expect(code).not.toMatch(/^WD\d{3}$/);
    }
  });
});

describe("Task 027 Phase 1 — ISxxx range does not collide with any other migration's custom codes", () => {
  it("no migration file other than 0026 raises an ISxxx code", () => {
    const migrationsDir = join(ROOT, "supabase", "migrations");
    const files: string[] = readdirSync(migrationsDir);
    for (const file of files) {
      if (file === "20260911041146_0026_intake_actions.sql") {
        continue;
      }
      const contents = readFileSync(join(migrationsDir, file), "utf8");
      expect(contents).not.toMatch(/USING ERRCODE = 'IS\d{3}'/);
    }
  });
});

describe("Task 027 Phase 1 Finding C — propagated Task 022 error (WD004) is a known business error, not duplicated here", () => {
  it("WD004 is not a key in INTAKE_RPC_ERROR_CODES (single source of truth stays with Task 022's own map)", () => {
    expect(Object.keys(INTAKE_RPC_ERROR_CODES)).not.toContain("WD004");
  });

  it("no WDxxx code of any kind is duplicated into INTAKE_RPC_ERROR_CODES", () => {
    for (const code of Object.keys(INTAKE_RPC_ERROR_CODES)) {
      expect(code).not.toMatch(/^WD\d{3}$/);
    }
  });

  it("the existing Task 022 map (SAVE_WEDDING_DETAILS_RPC_ERROR_CODES) still maps WD004 to ApiError kind INVARIANT", () => {
    expect(SAVE_WEDDING_DETAILS_RPC_ERROR_CODES.WD004).toBeDefined();
    expect(SAVE_WEDDING_DETAILS_RPC_ERROR_CODES.WD004.kind).toBe("INVARIANT");
  });

  it("INVARIANT resolves to HTTP 422 — the frozen status a propagated WD004 must surface as", () => {
    expect(apiErrorStatus(SAVE_WEDDING_DETAILS_RPC_ERROR_CODES.WD004.kind)).toBe(422);
  });

  it("migration 0026 actually raises WD004 nowhere itself (it only ever propagates it from the nested save_wedding_details() call, migration 0021 owns the RAISE EXCEPTION site)", () => {
    const contents = readMigration();
    expect(contents).not.toMatch(/RAISE EXCEPTION[\s\S]{0,80}USING ERRCODE = 'WD004'/);
  });
});
