import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { generateAccessToken } from "../../auth/access-token-crypto";
import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { handleListAccessLinksRequest } from "../../routes/access-link-inventory";
import { handleRevokeAccessLinkRequest } from "../../routes/access-links";
import { supabaseAccessLinkInventoryGateway } from "../../supabase/access-link-inventory-repository";
import type { AccessLinkInventoryGateway } from "../access-link-inventory-gateway";
import type { AccessLinkInventoryRow } from "../access-link-inventory-types";
import type { AccessLinkStaffGateway } from "../access-link-staff-gateway";
import { deriveAccessLinkStatus, listAccessLinks } from "../list-access-links";
import { resolveAccessLink } from "../resolve-access-link";

/** Launch Hardening 02 / P0-1 — staff access-link inventory + revoke. */

const ROOT = join(__dirname, "../../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "99999999-9999-4999-8999-999999999999";
const NOW = new Date("2026-10-06T12:00:00.000Z");

interface FakeClient {
  marker: string;
}

function authGateway(profile: { role: string; displayName: string } | null, userId: string | null = "u-1"): StaffAuthGateway<FakeClient> {
  return {
    createClient: (accessToken) => ({ marker: `client-for-${accessToken}` }),
    async getAuthenticatedUserId() {
      return userId;
    },
    async getActiveStaffProfile() {
      return profile;
    },
  };
}
const STAFF = authGateway({ role: "STAFF", displayName: "Staff" });
const ADMIN = authGateway({ role: "ADMIN", displayName: "Admin" });
const NON_STAFF = authGateway(null);

function row(id: string, overrides: Partial<AccessLinkInventoryRow> = {}): AccessLinkInventoryRow {
  return {
    id,
    projectId: PROJECT_ID,
    linkType: "PORTAL",
    createdAt: "2026-10-01T00:00:00.000Z",
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    ...overrides,
  };
}

const ROWS: AccessLinkInventoryRow[] = [
  row("00000000-0000-4000-8000-000000000001", { createdAt: "2026-10-01T00:00:00.000Z" }),
  row("00000000-0000-4000-8000-000000000002", { linkType: "REVIEW", createdAt: "2026-10-05T00:00:00.000Z", revokedAt: "2026-10-05T01:00:00.000Z" }),
  row("00000000-0000-4000-8000-000000000003", { linkType: "INTAKE", createdAt: "2026-10-03T00:00:00.000Z", expiresAt: "2026-10-04T00:00:00.000Z" }),
  row("00000000-0000-4000-8000-000000000004", { createdAt: "2026-10-04T00:00:00.000Z", lastUsedAt: "2026-10-05T08:00:00.000Z" }),
  row("00000000-0000-4000-8000-000000000005", { linkType: "REVIEW", createdAt: "2026-10-04T00:00:00.000Z" }),
];

function inventoryGateway(rows: AccessLinkInventoryRow[] = ROWS, exists = true): AccessLinkInventoryGateway<FakeClient> & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async projectExists(_client, projectId) {
      calls.push(`exists:${projectId}`);
      return exists;
    },
    async listAccessLinks(_client, projectId) {
      calls.push(`list:${projectId}`);
      return rows;
    },
  };
}

const staffContext = { userId: "u-1", role: "STAFF" as const, displayName: "Staff", supabase: { marker: "c" } };

describe("GET access-links — authorization (A–E)", () => {
  it("A/B: STAFF and ADMIN may list; response is no-store", async () => {
    for (const auth of [STAFF, ADMIN]) {
      const result = await handleListAccessLinksRequest("Bearer t", PROJECT_ID, auth, inventoryGateway());
      expect(result.status).toBe(200);
      expect(result.headers["Cache-Control"]).toBe("no-store");
    }
  });

  it("C/D: missing bearer → 401, unknown user → 401, non-staff → 403; the gateway is never reached", async () => {
    const gateway = inventoryGateway();
    expect((await handleListAccessLinksRequest(null, PROJECT_ID, STAFF, gateway)).status).toBe(401);
    expect((await handleListAccessLinksRequest("Bearer t", PROJECT_ID, authGateway(null, null), gateway)).status).toBe(401);
    expect((await handleListAccessLinksRequest("Bearer t", PROJECT_ID, NON_STAFF, gateway)).status).toBe(403);
    expect(gateway.calls).toEqual([]);
  });

  it("E: unknown Project → 404 without listing; malformed id → 400", async () => {
    const missing = inventoryGateway(ROWS, false);
    const result = await handleListAccessLinksRequest("Bearer t", PROJECT_ID, STAFF, missing);
    expect(result.status).toBe(404);
    expect(missing.calls).toEqual([`exists:${PROJECT_ID}`]);
    expect((await handleListAccessLinksRequest("Bearer t", "not-a-uuid", STAFF, inventoryGateway())).status).toBe(400);
  });

  it("an unexpected repository failure is a generic 500 (never a partial list)", async () => {
    const failing: AccessLinkInventoryGateway<FakeClient> = {
      projectExists: async () => true,
      listAccessLinks: async () => {
        throw new Error("Failed to query project access links");
      },
    };
    const result = await handleListAccessLinksRequest("Bearer t", PROJECT_ID, STAFF, failing);
    expect(result).toMatchObject({ status: 500, body: { error: "Internal server error" } });
  });
});

describe("listAccessLinks — status, completeness, ordering (F–O)", () => {
  it("G/H/I/J/K: every link is returned with its type and frozen-precedence status", async () => {
    const items = await listAccessLinks(PROJECT_ID, staffContext, inventoryGateway(), () => NOW);
    expect(items).toHaveLength(ROWS.length);
    const byId = Object.fromEntries(items.map((item) => [item.id.slice(-1), item]));
    expect(byId["1"]).toMatchObject({ linkType: "PORTAL", status: "ACTIVE" });
    expect(byId["2"]).toMatchObject({ linkType: "REVIEW", status: "REVOKED", revokedAt: "2026-10-05T01:00:00.000Z" });
    expect(byId["3"]).toMatchObject({ linkType: "INTAKE", status: "EXPIRED" });
    expect(byId["4"]).toMatchObject({ status: "ACTIVE", lastUsedAt: "2026-10-05T08:00:00.000Z" });
  });

  it("K: status precedence matches the frozen resolver — revoked beats expired; expires_at == now is expired", () => {
    expect(deriveAccessLinkStatus(row("x", { revokedAt: "2026-10-02T00:00:00.000Z", expiresAt: "2026-10-01T00:00:00.000Z" }), NOW)).toBe("REVOKED");
    expect(deriveAccessLinkStatus(row("x", { expiresAt: NOW.toISOString() }), NOW)).toBe("EXPIRED");
    expect(deriveAccessLinkStatus(row("x", { expiresAt: "2026-10-07T00:00:00.000Z" }), NOW)).toBe("ACTIVE");
  });

  it("O: active first, then inactive; each group newest first with a deterministic id tie-break", async () => {
    const items = await listAccessLinks(PROJECT_ID, staffContext, inventoryGateway(), () => NOW);
    expect(items.map((item) => item.id.slice(-1))).toEqual(["5", "4", "1", "2", "3"]);
    const reversed = await listAccessLinks(PROJECT_ID, staffContext, inventoryGateway([...ROWS].reverse()), () => NOW);
    expect(reversed.map((item) => item.id)).toEqual(items.map((item) => item.id));
  });

  it("L/M/N: items carry only id/type/status/timestamps — no token, hash, hint, Project or creator id", async () => {
    const items = await listAccessLinks(PROJECT_ID, staffContext, inventoryGateway(), () => NOW);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(["createdAt", "expiresAt", "id", "lastUsedAt", "linkType", "revokedAt", "status"]);
    }
    const result = await handleListAccessLinksRequest("Bearer t", PROJECT_ID, STAFF, inventoryGateway());
    expect(JSON.stringify(result.body)).not.toMatch(/token|hash|hint|projectId|project_id|created_by|createdBy/i);
  });
});

/** Minimal awaitable PostgREST builder fake recording the query it receives. */
function fakeSupabase(result: { data: unknown; error: unknown; count: number | null }) {
  const recorded: { table?: string; columns?: string; options?: unknown; eq: [string, string][]; order: string[] } = { eq: [], order: [] };
  const builder = {
    select(columns: string, options?: unknown) {
      recorded.columns = columns;
      recorded.options = options;
      return builder;
    },
    eq(column: string, value: string) {
      recorded.eq.push([column, value]);
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      recorded.order.push(`${column}:${options.ascending ? "asc" : "desc"}`);
      return builder;
    },
    then(resolve: (value: typeof result) => unknown) {
      return Promise.resolve(result).then(resolve);
    },
  };
  const client = {
    from(table: string) {
      recorded.table = table;
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, recorded };
}

const dbRow = (id: string, projectId = PROJECT_ID) => ({
  id,
  project_id: projectId,
  link_type: "PORTAL",
  created_at: "2026-10-01T00:00:00+00:00",
  expires_at: null,
  revoked_at: null,
  last_used_at: null,
});

describe("repository — exact scope and completeness (F, G, L)", () => {
  it("F/L: selects explicit non-secret columns of exactly this Project with an exact count", async () => {
    const { client, recorded } = fakeSupabase({ data: [dbRow("00000000-0000-4000-8000-000000000001")], error: null, count: 1 });
    const rows = await supabaseAccessLinkInventoryGateway.listAccessLinks(client, PROJECT_ID);
    expect(rows).toHaveLength(1);
    expect(recorded.table).toBe("project_access_links");
    expect(recorded.columns).toBe("id, project_id, link_type, created_at, expires_at, revoked_at, last_used_at");
    expect(recorded.columns).not.toMatch(/token|created_by/);
    expect(recorded.options).toEqual({ count: "exact" });
    expect(recorded.eq).toEqual([["project_id", PROJECT_ID]]);
    expect(recorded.order).toEqual(["created_at:desc", "id:desc"]);
  });

  it("G: a row cap that hides any row fails closed instead of returning a partial list", async () => {
    const { client } = fakeSupabase({ data: [dbRow("00000000-0000-4000-8000-000000000001")], error: null, count: 2 });
    await expect(supabaseAccessLinkInventoryGateway.listAccessLinks(client, PROJECT_ID)).rejects.toThrow();
  });

  it("F: a row of another Project or an unknown link type is a hard failure, never filtered silently", async () => {
    const foreign = fakeSupabase({ data: [dbRow("00000000-0000-4000-8000-000000000001", OTHER_PROJECT_ID)], error: null, count: 1 });
    await expect(supabaseAccessLinkInventoryGateway.listAccessLinks(foreign.client, PROJECT_ID)).rejects.toThrow();
    const badType = fakeSupabase({ data: [{ ...dbRow("00000000-0000-4000-8000-000000000001"), link_type: "GUEST" }], error: null, count: 1 });
    await expect(supabaseAccessLinkInventoryGateway.listAccessLinks(badType.client, PROJECT_ID)).rejects.toThrow();
  });
});

describe("revoke — canonical Task 026 route reused (P–W)", () => {
  function staffGateway(revoke: AccessLinkStaffGateway<FakeClient>["revokeAccessLink"]): AccessLinkStaffGateway<FakeClient> & { calls: unknown[] } {
    const calls: unknown[] = [];
    const unused = async () => {
      throw new Error("not called");
    };
    return {
      calls,
      projectExists: unused,
      issueDirectAccessLink: unused,
      issueReviewLink: unused,
      rotateAccessLink: unused,
      async revokeAccessLink(client, params) {
        calls.push(params);
        return revoke(client, params);
      },
    };
  }
  const revoked = async (_client: FakeClient, params: { projectId: string; accessLinkId: string }) => ({
    id: params.accessLinkId,
    projectId: params.projectId,
    linkType: "PORTAL" as const,
    revokedAt: NOW.toISOString(),
  });
  const LINK = "00000000-0000-4000-8000-000000000001";

  it("P/Q/T: STAFF and ADMIN revoke through revoke_access_link pinned to (projectId, linkId)", async () => {
    for (const auth of [STAFF, ADMIN]) {
      const gateway = staffGateway(revoked);
      const result = await handleRevokeAccessLinkRequest("Bearer t", PROJECT_ID, LINK, auth, gateway);
      expect(result.status).toBe(200);
      expect(gateway.calls).toEqual([{ projectId: PROJECT_ID, accessLinkId: LINK }]);
    }
  });

  it("R/S/U: cross-Project or unknown link → 404 (AL003); already revoked → 409 (AL004); never a restore", async () => {
    const notFound = staffGateway(async () => {
      throw new ApiError("NOT_FOUND", "Access link not found");
    });
    expect((await handleRevokeAccessLinkRequest("Bearer t", OTHER_PROJECT_ID, LINK, STAFF, notFound)).status).toBe(404);
    const already = staffGateway(async () => {
      throw new ApiError("CONFLICT", "Access link is already revoked");
    });
    expect((await handleRevokeAccessLinkRequest("Bearer t", PROJECT_ID, LINK, STAFF, already)).status).toBe(409);
    const sql = read("supabase/migrations/20260911041145_0025_access_link_actions.sql");
    const revokeFn = sql.slice(sql.indexOf("CREATE FUNCTION public.revoke_access_link"));
    expect(revokeFn).toMatch(/WHERE p\.id = p_access_link_id\s+AND p\.project_id = p_project_id\s+FOR UPDATE/);
    expect(revokeFn).toMatch(/ERRCODE = 'AL004'/);
    expect(revokeFn).not.toMatch(/revoked_at = NULL/);
  });

  it("W: once revoked, the token stops resolving (REVOKED_TOKEN) and the inventory shows REVOKED", async () => {
    const { rawToken } = generateAccessToken();
    const revokedRow = { id: LINK, projectId: PROJECT_ID, linkType: "PORTAL" as const, expiresAt: null, revokedAt: NOW.toISOString() };
    const repository = {
      lookupByTokenHash: async () => revokedRow,
      touchLastUsedAt: async () => {
        throw new Error("a revoked link must never be touched");
      },
    };
    await expect(resolveAccessLink({ rawToken, expectedLinkType: "PORTAL" }, repository, () => NOW)).rejects.toMatchObject({ kind: "REVOKED_TOKEN" });
    expect(deriveAccessLinkStatus(row(LINK, { revokedAt: revokedRow.revokedAt }), NOW)).toBe("REVOKED");
  });
});

describe("static boundaries (X, AD, AE, AF)", () => {
  const NEW_SERVER_FILES = [
    "lib/server/access-links/access-link-inventory-types.ts",
    "lib/server/access-links/access-link-inventory-gateway.ts",
    "lib/server/access-links/list-access-links.ts",
    "lib/server/supabase/access-link-inventory-repository.ts",
    "lib/server/routes/access-link-inventory.ts",
  ];

  it("X/AD: the inventory is read-only and staff-session only — no service_role, no write, no rpc, no activity log", () => {
    for (const file of NEW_SERVER_FILES) {
      const contents = read(file);
      expect(contents).not.toMatch(/service-role-client|createServiceRoleSupabaseClient|SUPABASE_SERVICE_ROLE_KEY/);
      expect(contents).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
      expect(contents).not.toMatch(/log_activity|activity_logs/);
    }
    // ACCESS_LINK_REVOKED is logged exactly once, inside revoke_access_link (0025) — the app never logs it again.
    const sql = read("supabase/migrations/20260911041145_0025_access_link_actions.sql");
    const revokeFn = sql.slice(sql.indexOf("CREATE FUNCTION public.revoke_access_link"), sql.indexOf("REVOKE ALL ON FUNCTION public.revoke_access_link"));
    expect(revokeFn.match(/'ACCESS_LINK_REVOKED'/g)).toHaveLength(1);
  });

  it("AE/AF: no migration 0044; Task 026 issue/rotate/revoke modules and Task 035A/035B runtime are byte-identical to HEAD", () => {
    // Launch Hardening 04 (owner-approved checkpoint maintenance): only the approved 0044; no 0045 or later.
    // TE-03B (checkpoint maintenance): exactly 0046 may follow 0044; 0045 is retired and must stay absent.
    // OWS-04 (checkpoint maintenance): exactly the data-only catalog seed 0047 may follow 0046.
    expect(readdirSync(join(ROOT, "supabase/migrations")).filter((name) => /_(004[4-9]|00[5-9]\d|0[1-9]\d\d)_/.test(name))).toEqual(["20260911041204_0044_republish_after_published.sql", "20260911041206_0046_project_template_media_slots.sql", "20260911041207_0047_seed_our_wedding_story_v1_catalog.sql"]);
    const changed = execFileSync(
      "git",
      [
        "diff",
        "--name-only",
        "HEAD",
        "--",
        "supabase",
        "proxy.ts",
        "next.config.ts",
        "package.json",
        "package-lock.json",
        "lib/server/rate-limit",
        "lib/server/routes/access-links.ts",
        "lib/server/access-links/access-link-staff-gateway.ts",
        "lib/server/access-links/revoke-access-link.ts",
        "lib/server/access-links/resolve-access-link.ts",
        "lib/server/supabase/access-link-staff-repository.ts",
        "app/api/v2/internal/projects/[id]/access-links/[linkId]",
        "app/portal",
        "app/i",
        "app/review",
        "components",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(changed.trim()).toBe("");
  });
});
