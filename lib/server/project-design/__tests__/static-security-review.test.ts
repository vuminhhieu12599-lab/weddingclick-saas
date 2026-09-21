import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security review checks for Task 028 (Project Design APIs).
 *
 * project_design get/upsert is DIRECT RLS per API_CONTRACT.md §8 — no
 * activity type exists for design changes in the frozen Activity Union
 * (§6), so this feature must never use service_role, never call an RPC,
 * never mutate project lifecycle, never write activity logs, and must stay
 * entirely inside the project_design/templates/template_versions boundary
 * (never invitation_versions/project_invitations, never Task-029 renderer
 * code).
 */
const ROOT = join(__dirname, "..", "..", "..", "..");

const PROJECT_DESIGN_FILES = [
  "lib/domain/template-design-manifest.ts",
  "lib/server/project-design/project-design-types.ts",
  "lib/server/project-design/project-design-gateway.ts",
  "lib/server/project-design/validate-template-design-manifest.ts",
  "lib/server/project-design/validate-save-project-design-input.ts",
  "lib/server/project-design/validate-design-config-against-manifest.ts",
  "lib/server/project-design/get-project-design.ts",
  "lib/server/project-design/save-project-design.ts",
  "lib/server/supabase/project-design-repository.ts",
  "lib/server/routes/project-design.ts",
  "app/api/v2/internal/projects/[id]/design/route.ts",
];

const TASK_028_ALL_PRODUCTION_FILES = [
  ...PROJECT_DESIGN_FILES,
  "lib/server/templates/templates-types.ts",
  "lib/server/templates/templates-gateway.ts",
  "lib/server/templates/list-templates.ts",
  "lib/server/supabase/templates-repository.ts",
  "lib/server/routes/templates.ts",
  "app/api/v2/internal/templates/route.ts",
];

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Task 028 static/security review", () => {
  it.each(TASK_028_ALL_PRODUCTION_FILES)("%s never references service_role", (relativePath) => {
    expect(read(relativePath)).not.toMatch(/service_role/i);
  });

  it.each(TASK_028_ALL_PRODUCTION_FILES)(
    "%s never references SUPABASE_SERVICE_ROLE_KEY",
    (relativePath) => {
      expect(read(relativePath)).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    },
  );

  it.each(TASK_028_ALL_PRODUCTION_FILES)("%s never calls log_activity", (relativePath) => {
    expect(read(relativePath)).not.toMatch(/log_activity/);
  });

  it.each(TASK_028_ALL_PRODUCTION_FILES)(
    "%s never references invitation_versions or project_invitations",
    (relativePath) => {
      const contents = read(relativePath);
      expect(contents).not.toMatch(/invitation_versions/);
      expect(contents).not.toMatch(/project_invitations/);
    },
  );

  it.each(TASK_028_ALL_PRODUCTION_FILES)(
    "%s never mutates project lifecycle (projects.status)",
    (relativePath) => {
      const contents = read(relativePath);
      expect(contents).not.toMatch(/transition_project_status/);
      expect(contents).not.toMatch(/\.update\(\s*\{\s*status\s*:/);
    },
  );

  it.each(TASK_028_ALL_PRODUCTION_FILES)(
    "%s never references React/JSX/renderer implementation",
    (relativePath) => {
      const contents = read(relativePath);
      expect(contents).not.toMatch(/from ["']react["']/);
      expect(contents).not.toMatch(/InvitationViewModel/);
      expect(contents).not.toMatch(/WeddingDomainResolver/i);
    },
  );

  it("project-design-repository.ts never calls .rpc(", () => {
    expect(read("lib/server/supabase/project-design-repository.ts")).not.toMatch(
      /\.rpc\s*\(/,
    );
  });

  it("templates-repository.ts never calls .rpc(", () => {
    expect(read("lib/server/supabase/templates-repository.ts")).not.toMatch(/\.rpc\s*\(/);
  });

  it("project-design-repository.ts issues an upsert (never a raw insert/update) for project_design writes", () => {
    const contents = read("lib/server/supabase/project-design-repository.ts");
    expect(contents).toMatch(/\.upsert\s*\(/);
  });

  it("templates-repository.ts never issues an INSERT/UPDATE/DELETE (catalog is read-only in Task 028)", () => {
    const contents = read("lib/server/supabase/templates-repository.ts");
    expect(contents).not.toMatch(/\.insert\s*\(/);
    expect(contents).not.toMatch(/\.update\s*\(/);
    expect(contents).not.toMatch(/\.delete\s*\(/);
    expect(contents).not.toMatch(/\.upsert\s*\(/);
  });

  it("app/api/.../templates/route.ts exports only GET (no template catalog mutation API)", () => {
    const contents = read("app/api/v2/internal/templates/route.ts");
    expect(contents).toMatch(/export async function GET/);
    expect(contents).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
  });

  it("app/api/.../design/route.ts exports only GET and PUT", () => {
    const contents = read("app/api/v2/internal/projects/[id]/design/route.ts");
    expect(contents).toMatch(/export async function GET/);
    expect(contents).toMatch(/export async function PUT/);
    expect(contents).not.toMatch(/export async function (POST|PATCH|DELETE)/);
  });

  it("templates-types.ts never declares a raw `manifest` DTO field (designManifest only)", () => {
    const contents = read("lib/server/templates/templates-types.ts");
    // The exported catalog DTO (TemplateVersionCatalogEntry) must expose
    // designManifest, never a raw `manifest` field alongside it.
    expect(contents).toMatch(/designManifest: TemplateDesignManifestV1/);
    expect(contents).not.toMatch(/^\s*manifest: TemplateDesignManifestV1/m);
  });

  it("list-templates.ts routes every version's manifest through validateTemplateDesignManifest before exposing it", () => {
    const contents = read("lib/server/templates/list-templates.ts");
    expect(contents).toMatch(/validateTemplateDesignManifest\(version\.manifest\)/);
  });

  /**
   * Task 028 itself authored exactly three HTTP operations (GET /templates,
   * GET /design, PUT /design). This asserts THAT ownership claim — the two
   * route files exist and export exactly their frozen methods (the
   * dedicated "exports only GET"/"exports only GET and PUT" tests below do
   * the method-level check) — it does NOT assert that no later approved
   * task may ever add a sibling route under either directory (e.g. a future
   * `app/api/v2/internal/templates/[id]/route.ts`). A global "this
   * directory must forever contain nothing else" assertion would make an
   * unrelated, legitimate later task's addition fail a frozen Task-028 test
   * for no Task-028 reason (Task 028 independent review patch 1, Finding A).
   */
  it("Task 028 authored exactly its two frozen route files", () => {
    expect(existsSync(join(ROOT, "app/api/v2/internal/templates/route.ts"))).toBe(true);
    expect(
      existsSync(join(ROOT, "app/api/v2/internal/projects/[id]/design/route.ts")),
    ).toBe(true);
  });

  it("migration 0011_project_design.sql is untouched by Task 028 (still defines the frozen table)", () => {
    const contents = read(
      "supabase/migrations/20260911041130_0011_project_design.sql",
    );
    expect(contents).toMatch(/CREATE TABLE public\.project_design/);
    expect(contents).toMatch(/template_version_id\s+UUID NOT NULL/);
  });

  it("migration 0010_templates_and_versions.sql is untouched by Task 028 (still defines the frozen tables)", () => {
    const contents = read(
      "supabase/migrations/20260911041129_0010_templates_and_versions.sql",
    );
    expect(contents).toMatch(/CREATE TABLE public\.templates/);
    expect(contents).toMatch(/CREATE TABLE public\.template_versions/);
  });

  /**
   * Task 028's "NO MIGRATION" requirement is a property of THIS task's own
   * diff/review, not a permanent repository-wide ban on any later task ever
   * adding migration 0027+. A global max-migration-number assertion would
   * fail the moment a legitimate later task's migration lands, even though
   * Task 028 itself remains completely untouched (Task 028 independent
   * review patch 1, Finding A). The two tests above — checking that
   * migrations 0010/0011 still contain their frozen Task-028 foundation
   * content — are the correct, non-global way to verify Task 028 authored
   * no migration change.
   */
});
