import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security review checks for Task 022 (task spec §12, extended by
 * the SQL-review patch's §5): the Wedding Details route/service/gateway
 * code must never reference `service_role`, must never call `log_activity`
 * directly (it is reachable only from inside the `save_wedding_details` SQL
 * function), must never issue a direct wedding_details INSERT/UPDATE (Save
 * must go only through the `save_wedding_details` RPC), and the migration
 * itself must revoke the `authenticated` INSERT/UPDATE table privilege that
 * would otherwise let a direct write bypass the audited business action.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");

const FILES_UNDER_REVIEW = [
  "lib/server/wedding-details/get-wedding-details.ts",
  "lib/server/wedding-details/save-wedding-details.ts",
  "lib/server/wedding-details/wedding-details-gateway.ts",
  "lib/server/wedding-details/validate-save-wedding-details-input.ts",
  "lib/server/wedding-details/wedding-details-types.ts",
  "lib/server/wedding-details/wedding-details-rpc-error-codes.ts",
  "lib/server/supabase/wedding-details-repository.ts",
  "lib/server/routes/wedding-details.ts",
  "app/api/v2/internal/projects/[id]/wedding-details/route.ts",
];

const MIGRATION_PATH = "supabase/migrations/20260911041141_0021_save_wedding_details.sql";

describe("Task 022 static/security review", () => {
  it.each(FILES_UNDER_REVIEW)("%s never references service_role", (relativePath) => {
    const contents = readFileSync(join(ROOT, relativePath), "utf8");
    expect(contents).not.toMatch(/service_role/i);
  });

  it.each(FILES_UNDER_REVIEW)("%s never calls log_activity directly", (relativePath) => {
    const contents = readFileSync(join(ROOT, relativePath), "utf8");
    expect(contents).not.toMatch(/log_activity/);
  });

  it("wedding-details-repository.ts never issues a direct wedding_details INSERT or UPDATE", () => {
    const contents = readFileSync(
      join(ROOT, "lib/server/supabase/wedding-details-repository.ts"),
      "utf8",
    );
    expect(contents).not.toMatch(/\.insert\s*\(/);
    expect(contents).not.toMatch(/\.update\s*\(/);
  });

  it("wedding-details-repository.ts's saveWeddingDetails calls only the save_wedding_details RPC", () => {
    const contents = readFileSync(
      join(ROOT, "lib/server/supabase/wedding-details-repository.ts"),
      "utf8",
    );
    expect(contents).toMatch(/client\.rpc\(\s*["']save_wedding_details["']/);
  });

  it("the migration revokes authenticated INSERT/UPDATE on wedding_details (audited-Save-only enforcement)", () => {
    const contents = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");
    expect(contents).toMatch(
      /REVOKE\s+INSERT\s*,\s*UPDATE\s+ON\s+TABLE\s+public\.wedding_details\s+FROM\s+authenticated\s*;/,
    );
  });

  it("the migration authorizes via public.is_staff() and does not duplicate a local role/is_active check", () => {
    const contents = readFileSync(join(ROOT, MIGRATION_PATH), "utf8");

    // Centralized authorization helper (docs/SECURITY.md §5.1) is actually
    // called as an executable condition, not merely mentioned in prose.
    expect(contents).toMatch(/IF\s+public\.is_staff\(\)\s+IS\s+NOT\s+TRUE\s+THEN/);

    // No independent local predicate re-implementing is_staff()'s own
    // role/is_active logic (the exact identifiers a duplicated check would
    // need — removed by the final authorization-centralization patch).
    expect(contents).not.toMatch(/v_caller_role/);
    expect(contents).not.toMatch(/v_caller_is_active/);
    expect(contents).not.toMatch(/p\.role/);
    expect(contents).not.toMatch(/p\.is_active/);
  });
});
