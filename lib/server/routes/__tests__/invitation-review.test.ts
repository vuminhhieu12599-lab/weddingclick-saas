import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { requiredInvitationVariantsForPackage, SERVICE_PACKAGE_CODES } from "../../../domain";
import type { StaffAuthGateway } from "../../auth/staff-context";
import type { CreateReviewVersionDependencies, CreateReviewVersionResult } from "../../invitation-review/create-review-version";

/**
 * Task 030 staff review HTTP boundary + static security contract:
 * staff auth before the body is read, 201/422/400 mapping with no-store,
 * DB policy == TS policy, staff-only RPC grant, no PUBLISHED write path,
 * no service_role, no public invitation route.
 */

const createSpy = vi.fn<(...args: unknown[]) => Promise<CreateReviewVersionResult>>();

vi.mock("../../invitation-review/create-review-version", async (importActual) => {
  const actual = await importActual<typeof import("../../invitation-review/create-review-version")>();
  return { ...actual, createReviewVersion: (...args: unknown[]) => createSpy(...args) };
});

const { handleCreateReviewVersionRequest } = await import("../invitation-review");

function authGateway(profile: { role: string; displayName: string } | null): StaffAuthGateway<string> {
  return {
    createClient: (token) => `client-for-${token}`,
    getAuthenticatedUserId: async () => "staff-1",
    getActiveStaffProfile: async () => profile,
  };
}
const deps = {} as CreateReviewVersionDependencies<string>;
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("POST review/versions handler", () => {
  it.each([
    ["no bearer", null, authGateway({ role: "STAFF", displayName: "S" }), 401],
    ["non-staff", "Bearer t", authGateway(null), 403],
  ])("%s → %d before the body is read or anything is written", async (_label, header, gateway, status) => {
    createSpy.mockReset();
    const readBody = vi.fn(async () => ({}));
    const result = await handleCreateReviewVersionRequest(header, PROJECT_ID, readBody, gateway, deps);
    expect(result.status).toBe(status);
    expect(readBody).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it("maps CREATED → 201, BLOCKED → 422 with issues, malformed JSON → 400", async () => {
    const staff = authGateway({ role: "STAFF", displayName: "S" });
    const version = { id: "v", versionNumber: 2 };
    createSpy.mockResolvedValueOnce({ status: "CREATED", version } as unknown as CreateReviewVersionResult);
    const created = await handleCreateReviewVersionRequest("Bearer t", PROJECT_ID, async () => ({ variant: "COMMON" }), staff, deps);
    expect(created).toMatchObject({ status: 201, body: { data: version } });
    expect(createSpy.mock.calls[0][2]).toMatchObject({ supabase: "client-for-t" });

    const issues = [{ code: "WEDDING_DETAILS_MISSING", severity: "BLOCKING", message: "m" }];
    createSpy.mockResolvedValueOnce({ status: "BLOCKED", issues } as unknown as CreateReviewVersionResult);
    const blocked = await handleCreateReviewVersionRequest("Bearer t", PROJECT_ID, async () => ({}), staff, deps);
    expect(blocked.status).toBe(422);
    expect(blocked.body).toMatchObject({ issues });

    const malformed = await handleCreateReviewVersionRequest("Bearer t", PROJECT_ID, async () => {
      throw new SyntaxError("bad json");
    }, staff, deps);
    expect(malformed.status).toBe(400);
  });
});

describe("Task 030 static security contract", () => {
  const root = join(__dirname, "..", "..", "..", "..");
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/--.*$/gm, "");
  const migration = readFileSync(join(root, "supabase", "migrations", "20260911041156_0036_create_review_version.sql"), "utf8");
  // Executable SQL only: comments and the trailing COMMENT ON text are documentation.
  const sql = strip(migration).split("COMMENT ON FUNCTION")[0];

  it("the DB variant policy equals the TypeScript policy for every package code", () => {
    for (const code of SERVICE_PACKAGE_CODES) {
      const variants = requiredInvitationVariantsForPackage(code);
      expect(variants).not.toBeNull();
      const list = variants!.map((v) => `'${v}'`).join(", ");
      expect(sql).toContain(`WHEN '${code}' THEN ARRAY[${list}]::text[]`);
    }
    expect(sql).toMatch(/ELSE NULL/);
  });

  it("the RPC is staff-only, REVIEW-only and never writes publication state", () => {
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_review_version\([^)]*\) TO authenticated;/);
    expect(sql).not.toMatch(/TO (anon|service_role|PUBLIC)\s*;/i);
    expect(sql).not.toMatch(/'PUBLISHED'|published_version_id|published_at|UPDATE public\.invitation_versions|DELETE FROM/);
    expect(sql).not.toMatch(/UPDATE public\.projects/);
    expect(sql).toMatch(/FOR NO KEY UPDATE/);
    expect(sql).toMatch(/version_type[\s\S]*'REVIEW'/);
  });

  it("review modules and routes use no service_role, no direct table writes, and add no public invitation route", () => {
    const dirs = [
      join(root, "lib", "server", "invitation-review"),
      join(root, "app", "api", "v2", "internal", "projects", "[id]", "review"),
    ];
    const files: string[] = [join(root, "lib", "server", "supabase", "invitation-review-repository.ts"), join(root, "lib", "server", "routes", "invitation-review.ts")];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "__tests__") walk(path);
        else if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    dirs.forEach(walk);
    const code = files.map((file) => strip(readFileSync(file, "utf8"))).join("\n");
    expect(code).not.toMatch(/service[_-]?role|SERVICE_ROLE/i);
    expect(code).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(code).not.toMatch(/rsvps|guest_token|publish_invitation/);
    expect(existsSync(join(root, "app", "i"))).toBe(false);
  });
});
