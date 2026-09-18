import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { apiErrorStatus, type ApiErrorKind } from "../../errors/api-error";
import { PROJECT_LIFECYCLE_RPC_ERROR_CODES } from "../project-lifecycle-rpc-error-codes";

/**
 * Cross-checks the PLxxx error-code map (Task 025 Authoring Phase 1) against
 * the actual `USING ERRCODE = 'PLxxx'` strings raised by migration 0024, so
 * the map can never silently drift from what the database really raises —
 * mirrors the discipline of lib/server/project-events/__tests__/
 * static-security-review.test.ts's dynamic index-name extraction (never
 * hardcode/assume a value independently of its source).
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATION_PATH =
  "supabase/migrations/20260911041144_0024_project_lifecycle_payment_assignment.sql";

function readMigration(): string {
  return readFileSync(join(ROOT, MIGRATION_PATH), "utf8");
}

/** Every distinct PLxxx code the migration actually raises, in file order (may repeat). */
function extractRaisedCodes(contents: string): string[] {
  const matches = contents.matchAll(/USING ERRCODE = '(PL\d{3})'/g);
  return [...matches].map((m) => m[1]);
}

const KNOWN_KINDS: ApiErrorKind[] = [
  "BAD_REQUEST",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVARIANT",
  "INTERNAL",
];

describe("PROJECT_LIFECYCLE_RPC_ERROR_CODES shape", () => {
  const codes = Object.keys(PROJECT_LIFECYCLE_RPC_ERROR_CODES);

  it("every key matches the PLxxx pattern", () => {
    for (const code of codes) {
      expect(code).toMatch(/^PL\d{3}$/);
    }
  });

  it("every entry has a known ApiErrorKind and a non-empty message", () => {
    for (const code of codes) {
      const entry = PROJECT_LIFECYCLE_RPC_ERROR_CODES[code];
      expect(KNOWN_KINDS).toContain(entry.kind);
      expect(entry.message.length).toBeGreaterThan(0);
      // apiErrorStatus must not throw for any kind used here.
      expect(() => apiErrorStatus(entry.kind)).not.toThrow();
    }
  });

  it("no entry maps to INTERNAL (every mapped code is an expected business condition, not a generic failure)", () => {
    for (const code of codes) {
      expect(PROJECT_LIFECYCLE_RPC_ERROR_CODES[code].kind).not.toBe("INTERNAL");
    }
  });

  it("no message contains raw SQL/Postgres wording", () => {
    for (const code of codes) {
      const message = PROJECT_LIFECYCLE_RPC_ERROR_CODES[code].message;
      expect(message).not.toMatch(/SQLSTATE|constraint|relation|column ".*" of/i);
    }
  });
});

describe("PROJECT_LIFECYCLE_RPC_ERROR_CODES cross-referenced against migration 0024", () => {
  const contents = readMigration();
  const raisedCodes = new Set(extractRaisedCodes(contents));
  const mappedCodes = new Set(Object.keys(PROJECT_LIFECYCLE_RPC_ERROR_CODES));

  it("the migration actually raises at least one PLxxx code", () => {
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

  it("the exact frozen code set is PL001 through PL010, no more, no fewer", () => {
    expect([...mappedCodes].sort()).toEqual([
      "PL001",
      "PL002",
      "PL003",
      "PL004",
      "PL005",
      "PL006",
      "PL007",
      "PL008",
      "PL009",
      "PL010",
    ]);
  });

  it.each([
    ["PL001", "FORBIDDEN"],
    ["PL002", "NOT_FOUND"],
    ["PL003", "BAD_REQUEST"],
    ["PL004", "CONFLICT"],
    ["PL005", "INVARIANT"],
    ["PL006", "INVARIANT"],
    ["PL007", "CONFLICT"],
    ["PL008", "CONFLICT"],
    ["PL009", "INVARIANT"],
    ["PL010", "BAD_REQUEST"],
  ])("%s maps to ApiError kind %s (frozen HTTP mapping)", (code, kind) => {
    expect(PROJECT_LIFECYCLE_RPC_ERROR_CODES[code].kind).toBe(kind);
  });
});
