import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security review checks for Task 024 Phase 1 (migration
 * 0023_project_media_storage.sql) — mirrors the review style of
 * lib/server/project-events/__tests__/static-security-review.test.ts
 * (Task 023): read the actual migration text and assert on it directly,
 * never assume its contents.
 *
 * Scope reminder (docs/API_CONTRACT.md §3.2, Task 024 frozen decisions):
 * this migration creates ONLY a Storage bucket row + bucket-scoped
 * storage.objects policies. It must never touch public.project_media,
 * invitation_version_media, activity_logs/log_activity, V1's
 * wedding-photos bucket, or introduce any new SQL function/RPC.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const MIGRATION_FILENAME = "20260911041143_0023_project_media_storage.sql";
const MIGRATION_PATH = join(MIGRATIONS_DIR, MIGRATION_FILENAME);

const FROZEN_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp4"];
const FROZEN_BUCKET_MAX_BYTES = 20 * 1024 * 1024;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

/** Slices out the `INSERT INTO storage.buckets (...) ... ;` statement. */
function extractBucketInsertStatement(contents: string): string {
  const start = contents.indexOf("INSERT INTO storage.buckets");
  expect(start).toBeGreaterThan(-1);
  const end = contents.indexOf(";", start);
  expect(end).toBeGreaterThan(start);
  return contents.slice(start, end + 1);
}

/** Slices out one `CREATE POLICY <name> ON storage.objects ... ;` statement. */
function extractPolicyStatement(contents: string, policyName: string): string {
  const start = contents.indexOf(`CREATE POLICY ${policyName}`);
  expect(start).toBeGreaterThan(-1);
  const end = contents.indexOf(";", start);
  expect(end).toBeGreaterThan(start);
  return contents.slice(start, end + 1);
}

describe("Task 024 Phase 1 — migration file placement", () => {
  it("0023_project_media_storage.sql exists and sorts immediately after 0022", () => {
    const files = readdirSync(MIGRATIONS_DIR).sort();
    expect(files).toContain(MIGRATION_FILENAME);
    const idx0022 = files.findIndex((f) => f.includes("0022_project_events_actions"));
    const idx0023 = files.indexOf(MIGRATION_FILENAME);
    expect(idx0022).toBeGreaterThan(-1);
    expect(idx0023).toBe(idx0022 + 1);
  });
});

describe("Task 024 Phase 1 — bucket definition", () => {
  const contents = readMigration();
  const insertStmt = extractBucketInsertStatement(contents);

  it("targets storage.buckets with the exact frozen column order", () => {
    expect(insertStmt).toMatch(
      /INSERT INTO storage\.buckets\s*\(\s*id\s*,\s*name\s*,\s*public\s*,\s*file_size_limit\s*,\s*allowed_mime_types\s*\)/,
    );
  });

  it("bucket id/name is exactly project-media", () => {
    expect(insertStmt).toMatch(/VALUES\s*\(\s*'project-media'\s*,\s*'project-media'\s*,/);
  });

  it("bucket is private (public = false)", () => {
    expect(insertStmt).toMatch(/'project-media'\s*,\s*'project-media'\s*,\s*false\s*,/);
    expect(insertStmt).not.toMatch(/'project-media'\s*,\s*'project-media'\s*,\s*true\s*,/);
  });

  it("hard file-size limit is exactly 20 MiB (20971520 bytes)", () => {
    expect(FROZEN_BUCKET_MAX_BYTES).toBe(20971520);
    expect(insertStmt).toMatch(/false\s*,\s*20971520\s*,/);
  });

  it("allowed_mime_types is exactly the frozen five-value list, no more, no fewer", () => {
    const arrayMatch = insertStmt.match(/ARRAY\s*\[([\s\S]*?)\]\s*::text\[\]/);
    expect(arrayMatch).not.toBeNull();
    const mimeTypes = arrayMatch![1]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => s.replace(/^'|'$/g, ""));
    expect(mimeTypes).toEqual(FROZEN_MIME_TYPES);
  });

  it("upserts declaratively (ON CONFLICT (id) DO UPDATE), not DO NOTHING", () => {
    expect(contents).toMatch(/ON CONFLICT \(id\) DO UPDATE SET/);
    expect(contents).not.toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });
});

describe("Task 024 Phase 1 — storage.objects policies", () => {
  const contents = readMigration();
  const policyNames = [
    "project_media_staff_select",
    "project_media_staff_insert",
    "project_media_staff_update",
    "project_media_staff_delete",
  ];
  const policyVerbs: Record<string, string> = {
    project_media_staff_select: "SELECT",
    project_media_staff_insert: "INSERT",
    project_media_staff_update: "UPDATE",
    project_media_staff_delete: "DELETE",
  };

  it.each(policyNames)("%s exists, targets storage.objects, TO authenticated", (name) => {
    const stmt = extractPolicyStatement(contents, name);
    expect(stmt).toMatch(/ON storage\.objects/);
    expect(stmt).toMatch(/TO authenticated/);
    expect(stmt).toMatch(new RegExp(`FOR ${policyVerbs[name]}\\b`));
  });

  it.each(policyNames)("%s is scoped to bucket_id = 'project-media'", (name) => {
    const stmt = extractPolicyStatement(contents, name);
    expect(stmt).toMatch(/bucket_id = 'project-media'/);
  });

  it.each(policyNames)("%s authorizes via public.is_staff()", (name) => {
    const stmt = extractPolicyStatement(contents, name);
    expect(stmt).toMatch(/public\.is_staff\(\)/);
  });

  it("UPDATE policy has both USING and WITH CHECK, each staff+bucket scoped", () => {
    const stmt = extractPolicyStatement(contents, "project_media_staff_update");
    const usingMatches = stmt.match(/bucket_id = 'project-media'\s*\n\s*AND public\.is_staff\(\)/g);
    expect(usingMatches?.length).toBe(2); // one in USING, one in WITH CHECK
  });

  it("exactly four CREATE POLICY statements exist in this migration", () => {
    const matches = contents.match(/CREATE POLICY /g) ?? [];
    expect(matches.length).toBe(4);
  });

  it("no anon-role policy exists", () => {
    expect(contents).not.toMatch(/TO anon/);
  });

  it("no PUBLIC-role grant/policy exists (uppercase PUBLIC keyword absent)", () => {
    expect(contents).not.toMatch(/\bPUBLIC\b/);
  });
});

describe("Task 024 Phase 1 — no scope creep", () => {
  const contents = readMigration();

  it("never mutates public.project_media (table shape, grants, RLS, or policies)", () => {
    expect(contents).not.toMatch(/CREATE TABLE public\.project_media/);
    expect(contents).not.toMatch(/ALTER TABLE public\.project_media/);
    expect(contents).not.toMatch(/GRANT[^;]*ON TABLE public\.project_media/);
    expect(contents).not.toMatch(/REVOKE[^;]*project_media/);
    expect(contents).not.toMatch(/CREATE POLICY[^;]*ON public\.project_media/);
  });

  it("never mutates invitation_version_media or activity_logs", () => {
    expect(contents).not.toMatch(/ALTER TABLE public\.invitation_version_media/);
    expect(contents).not.toMatch(/ALTER TABLE public\.activity_logs/);
  });

  it("never calls or references log_activity", () => {
    expect(contents).not.toMatch(/log_activity/);
  });

  it("never references service_role", () => {
    expect(contents).not.toMatch(/service_role/i);
  });

  it("never creates a SQL function (no new business-action RPC)", () => {
    expect(contents).not.toMatch(/CREATE FUNCTION/);
    expect(contents).not.toMatch(/CREATE OR REPLACE FUNCTION/);
  });

  it("never mutates the wedding-photos bucket or its policies", () => {
    expect(contents).not.toMatch(/'wedding-photos'/);
  });

  it("never touches storage.objects table-level RLS enablement or grants", () => {
    expect(contents).not.toMatch(/ALTER TABLE storage\.objects ENABLE ROW LEVEL SECURITY/);
    expect(contents).not.toMatch(/ALTER TABLE storage\.objects FORCE ROW LEVEL SECURITY/);
    expect(contents).not.toMatch(/GRANT[^;]*ON TABLE storage\.objects/);
    expect(contents).not.toMatch(/REVOKE[^;]*ON TABLE storage\.objects/);
  });

  it("touches only storage.buckets (one row) and storage.objects (policies) — no other table", () => {
    const createTableMatches = contents.match(/CREATE TABLE\s+\S+/g) ?? [];
    expect(createTableMatches.length).toBe(0);
    const alterTableMatches = contents.match(/ALTER TABLE\s+\S+/g) ?? [];
    expect(alterTableMatches.length).toBe(0);
  });
});
