import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { apiErrorStatus, type ApiErrorKind } from "../../errors/api-error";
import { ACCESS_LINK_RPC_ERROR_CODES } from "../access-link-rpc-error-codes";

/**
 * Cross-checks the ALxxx error-code map (Task 026 Authoring Phase 1) against
 * the actual `USING ERRCODE = 'ALxxx'` strings raised by migration 0025, so
 * the map can never silently drift from what the database really raises —
 * mirrors lib/server/project-lifecycle/__tests__/
 * project-lifecycle-rpc-error-codes.test.ts (Task 025).
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATION_PATH = "supabase/migrations/20260911041145_0025_access_link_actions.sql";

function readMigration(): string {
  return readFileSync(join(ROOT, MIGRATION_PATH), "utf8");
}

/** Every distinct ALxxx code the migration actually raises, in file order (may repeat). */
function extractRaisedCodes(contents: string): string[] {
  const matches = contents.matchAll(/USING ERRCODE = '(AL\d{3})'/g);
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

describe("ACCESS_LINK_RPC_ERROR_CODES shape", () => {
  const codes = Object.keys(ACCESS_LINK_RPC_ERROR_CODES);

  it("every key matches the ALxxx pattern", () => {
    for (const code of codes) {
      expect(code).toMatch(/^AL\d{3}$/);
    }
  });

  it("every entry has a known ApiErrorKind and a non-empty message", () => {
    for (const code of codes) {
      const entry = ACCESS_LINK_RPC_ERROR_CODES[code];
      expect(KNOWN_KINDS).toContain(entry.kind);
      expect(entry.message.length).toBeGreaterThan(0);
      // apiErrorStatus must not throw for any kind used here.
      expect(() => apiErrorStatus(entry.kind)).not.toThrow();
    }
  });

  it("no entry maps to INTERNAL (every mapped code is an expected business condition, not a generic failure)", () => {
    for (const code of codes) {
      expect(ACCESS_LINK_RPC_ERROR_CODES[code].kind).not.toBe("INTERNAL");
    }
  });

  it("no message contains raw SQL/Postgres wording", () => {
    for (const code of codes) {
      const message = ACCESS_LINK_RPC_ERROR_CODES[code].message;
      expect(message).not.toMatch(/SQLSTATE|constraint|relation|column ".*" of/i);
    }
  });

  it("no message and no key reveals raw token/token_hash/token_hint material", () => {
    for (const code of codes) {
      const message = ACCESS_LINK_RPC_ERROR_CODES[code].message;
      expect(message).not.toMatch(/token_hash|token_hint|raw token/i);
    }
  });
});

describe("ACCESS_LINK_RPC_ERROR_CODES cross-referenced against migration 0025", () => {
  const contents = readMigration();
  const raisedCodes = new Set(extractRaisedCodes(contents));
  const mappedCodes = new Set(Object.keys(ACCESS_LINK_RPC_ERROR_CODES));

  it("the migration actually raises at least one ALxxx code", () => {
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

  it("the exact frozen code set is AL001 through AL005, no more, no fewer", () => {
    expect([...mappedCodes].sort()).toEqual(["AL001", "AL002", "AL003", "AL004", "AL005"]);
  });

  it.each([
    ["AL001", "FORBIDDEN"],
    ["AL002", "NOT_FOUND"],
    ["AL003", "NOT_FOUND"],
    ["AL004", "CONFLICT"],
    ["AL005", "CONFLICT"],
  ])("%s maps to ApiError kind %s (frozen HTTP mapping)", (code, kind) => {
    expect(ACCESS_LINK_RPC_ERROR_CODES[code].kind).toBe(kind);
  });

  it("PLxxx/PExxx codes from other tasks never appear as keys in this map (distinct range, D7/§ Custom SQLSTATE Contract)", () => {
    for (const code of mappedCodes) {
      expect(code).not.toMatch(/^PL\d{3}$/);
      expect(code).not.toMatch(/^PE\d{3}$/);
    }
  });
});
