import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static/security review checks scoped to the Template Catalog feature
 * (Task 028). Broader cross-feature checks (route count, migration
 * integrity, no invitation_versions/lifecycle/RPC anywhere in Task 028)
 * live in lib/server/project-design/__tests__/static-security-review.test.ts
 * — this file focuses on the catalog-specific "read-only, validated-subset
 * only" boundary.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");

const FILES_UNDER_REVIEW = [
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

describe("Task 028 templates catalog static/security review", () => {
  it.each(FILES_UNDER_REVIEW)("%s never references an elevated-access credential", (relativePath) => {
    expect(read(relativePath)).not.toMatch(/service_role/i);
  });

  it("the catalog route requires staff authorization before returning any data", () => {
    const contents = read("lib/server/routes/templates.ts");
    expect(contents).toMatch(/requireStaff/);
  });

  it("selectable is computed server-side from is_active/retired_at, never read from client input", () => {
    const contents = read("lib/server/templates/list-templates.ts");
    expect(contents).toMatch(
      /selectable:\s*template\.isActive === true && version\.retiredAt === null/,
    );
  });

  it("the catalog route carries Cache-Control: no-store on every response", () => {
    const contents = read("lib/server/routes/templates.ts");
    expect(contents).toMatch(/"Cache-Control":\s*"no-store"/);
  });

  it("list-templates.ts never accepts an event-type filter parameter (no speculative filtering in V1)", () => {
    const contents = read("lib/server/templates/list-templates.ts");
    expect(contents).not.toMatch(/eventType\s*[:=]\s*(string|req\.|query\.)/);
  });
});
