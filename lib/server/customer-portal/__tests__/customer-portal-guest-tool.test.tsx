import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { execFileSync } from "node:child_process";

import { generateAccessToken, hashAccessToken } from "../../auth/access-token-crypto";
import { issueGuestLink } from "../../guest-links/issue-guest-link";
import { supabaseGuestLinkStaffGateway } from "../../supabase/guest-link-staff-repository";
import type { AccessLinkResolutionRepository, ResolvedAccessLinkRow } from "../../supabase/access-link-resolution-repository";
import {
  getServiceRolePortalGuestGateway,
  getServiceRolePortalGuestLinkGateway,
  toPortalGuestRecord,
  toPortalGuestRsvpRecord,
} from "../../supabase/portal-guest-repository";
import {
  handleCreatePortalGuestRequest,
  handleIssuePortalGuestLinkRequest,
  handleRevokePortalGuestRequest,
  handleUpdatePortalGuestRequest,
} from "../../routes/portal-guests";
import { loadCustomerPortal } from "../load-customer-portal";
import {
  attachGuestRsvpStatuses,
  createPortalGuest,
  issuePortalGuestLink,
  presentPortalGuests,
  revokePortalGuest,
  updatePortalGuest,
  type PortalGuestToolDependencies,
} from "../portal-guest-tool";

/**
 * Task 033E-A — Portal Guest Tool foundation. The REAL service_role
 * repository runs against an in-memory PostgREST-style table fake, so its
 * Project pinning and conditional-write predicates are exercised, not mocked.
 */

vi.mock("../../supabase/service-role-client", () => ({ createServiceRoleSupabaseClient: () => fakeClient() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const PROJECT_A = "a0000000-0000-4000-8000-00000000000a";
const PROJECT_B = "b0000000-0000-4000-8000-00000000000b";
const GUEST_A1 = "f0000000-0000-4000-8000-0000000000a1";
const GUEST_A2 = "f0000000-0000-4000-8000-0000000000a2";
const GUEST_B1 = "f0000000-0000-4000-8000-0000000000b1";

// ---------------------------------------------------------------------------
// In-memory tables + a minimal PostgREST query-builder fake
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
let db: Record<string, Row[]>;
let writes: { table: string; op: "insert" | "update" | "delete"; payload: Row }[];
let idSeq = 0;

function seed(opts: { packageA?: string; entitledA?: boolean; publishedA?: boolean; publishedBrideA?: boolean } = {}) {
  const issuedAt = "2026-10-04T00:00:00Z";
  db = {
    projects: [
      { id: PROJECT_A, package_code_snapshot: opts.packageA ?? "SEPARATE" },
      { id: PROJECT_B, package_code_snapshot: "COMMON" },
    ],
    project_invitations: [
      { id: "11111111-0000-4000-8000-000000000001", project_id: PROJECT_A, variant: "GROOM", public_slug: "wc-a-groom", published_version_id: opts.publishedA === false ? null : "22222222-0000-4000-8000-000000000001" },
      { id: "11111111-0000-4000-8000-000000000002", project_id: PROJECT_B, variant: "COMMON", public_slug: "wc-b-common", published_version_id: "22222222-0000-4000-8000-000000000002" },
      {
        id: "11111111-0000-4000-8000-000000000003",
        project_id: PROJECT_A,
        variant: "BRIDE",
        public_slug: "wc-a-bride",
        published_version_id: opts.publishedA === false || opts.publishedBrideA === false ? null : "22222222-0000-4000-8000-000000000003",
      },
    ],
    invitation_versions: [
      { id: "22222222-0000-4000-8000-000000000001", invitation_id: "11111111-0000-4000-8000-000000000001", project_id: PROJECT_A, version_type: "PUBLISHED" },
      { id: "22222222-0000-4000-8000-000000000002", invitation_id: "11111111-0000-4000-8000-000000000002", project_id: PROJECT_B, version_type: "PUBLISHED" },
      { id: "22222222-0000-4000-8000-000000000003", invitation_id: "11111111-0000-4000-8000-000000000003", project_id: PROJECT_A, version_type: "PUBLISHED" },
    ],
    project_addons: [
      ...(opts.entitledA === false ? [] : [{ id: "33333333-0000-4000-8000-000000000001", project_id: PROJECT_A, addon_code_snapshot: "PERSONALIZED_GUEST", revoked_at: null }]),
      { id: "33333333-0000-4000-8000-000000000002", project_id: PROJECT_B, addon_code_snapshot: "PERSONALIZED_GUEST", revoked_at: null },
    ],
    guests: [
      guestRow(GUEST_A1, PROJECT_A, "Anh Hiếu và gia đình", "GROOM", null),
      guestRow(GUEST_A2, PROJECT_A, "Chú B và người thương", "BRIDE", issuedAt),
      guestRow(GUEST_B1, PROJECT_B, "Khách dự án B", "COMMON", null),
    ],
    rsvps: [{ id: "44444444-0000-4000-8000-000000000001", project_id: PROJECT_A, guest_id: GUEST_A2, attendance: "ATTENDING", party_size: 2 }],
  };
  writes = [];
}

function guestRow(id: string, projectId: string, name: string, variant: string | null, issuedAt: string | null): Row {
  return {
    id,
    project_id: projectId,
    display_name: name,
    invitation_variant: variant,
    token_hash: "\\x" + "00".repeat(32),
    token_hint: issuedAt === null ? null : "hint1234",
    token_issued_at: issuedAt,
    revoked_at: null,
    phone: "0900000000",
    note: "staff note",
    group_name: "Bạn đại học",
    created_by: null,
    created_at: "2026-10-01T00:00:00Z",
  };
}

function fakeClient() {
  return {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let op: "select" | "insert" | "update" = "select";
      let payload: Row = {};
      let columns = "*";
      let countExact = false;
      let single = false;
      const project = (row: Row) => (columns === "*" ? { ...row } : Object.fromEntries(columns.split(",").map((c) => c.trim()).map((c) => [c, row[c]])));
      const run = () => {
        if (op === "insert") {
          const row = { id: `99999999-0000-4000-8000-${String(++idSeq).padStart(12, "0")}`, created_at: "2026-10-05T00:00:00Z", ...payload };
          writes.push({ table, op, payload });
          db[table].push(row);
          return { data: [project(row)], error: null };
        }
        const matched = db[table].filter((row) => filters.every((f) => f(row)));
        if (op === "update") {
          writes.push({ table, op, payload });
          matched.forEach((row) => Object.assign(row, payload));
        }
        const data = matched.map(project);
        if (single) return { data: data[0] ?? null, error: null };
        return { data, error: null, count: countExact ? data.length : null };
      };
      const builder = {
        select(cols?: string, opts?: { count?: string }) {
          if (cols !== undefined) columns = cols;
          countExact = opts?.count === "exact";
          return builder;
        },
        insert(row: Row) {
          op = "insert";
          payload = row;
          return builder;
        },
        update(patch: Row) {
          op = "update";
          payload = patch;
          return builder;
        },
        delete() {
          writes.push({ table, op: "delete", payload: {} });
          throw new Error("DELETE is never expected");
        },
        eq(col: string, value: unknown) {
          filters.push((row) => row[col] === value);
          return builder;
        },
        is(col: string, value: null) {
          filters.push((row) => row[col] === value);
          return builder;
        },
        not(col: string, _op: "is", value: null) {
          filters.push((row) => row[col] !== value);
          return builder;
        },
        in(col: string, values: unknown[]) {
          filters.push((row) => values.includes(row[col]));
          return builder;
        },
        or(expression: string) {
          const parts = expression.split(",").map((part) => part.split("."));
          filters.push((row) => parts.some(([col, opName, value]) => (opName === "is" ? row[col] === null : row[col] === value)));
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle() {
          single = true;
          return builder;
        },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          try {
            return Promise.resolve(run()).then(resolve, reject);
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
        },
      };
      return builder;
    },
  };
}

// ---------------------------------------------------------------------------
// PORTAL token fake + dependencies
// ---------------------------------------------------------------------------

const PORTAL_A = generateAccessToken();
const PORTAL_B = generateAccessToken();
const REVIEW_A = generateAccessToken();

function resolution(): AccessLinkResolutionRepository {
  const rows: [ReturnType<typeof generateAccessToken>, Partial<ResolvedAccessLinkRow>][] = [
    [PORTAL_A, { projectId: PROJECT_A }],
    [PORTAL_B, { projectId: PROJECT_B }],
    [REVIEW_A, { projectId: PROJECT_A, linkType: "REVIEW" }],
  ];
  return {
    async lookupByTokenHash(hash) {
      const hit = rows.find(([token]) => hex(token.tokenHash) === hex(hash));
      return hit === undefined ? null : { id: GUEST_A1, projectId: PROJECT_A, linkType: "PORTAL", expiresAt: null, revokedAt: null, ...hit[1] };
    },
    async touchLastUsedAt() {},
  };
}

const deps = (): PortalGuestToolDependencies => ({
  resolution: resolution(),
  guests: getServiceRolePortalGuestGateway(),
  guestLinks: getServiceRolePortalGuestLinkGateway(),
});
const body = (value: unknown) => async () => value;
const guest = (id: string) => db.guests.find((row) => row.id === id) as Row;

beforeEach(() => seed());

// ---------------------------------------------------------------------------

describe("033E-A A–E: PERSONALIZED_GUEST gating", () => {
  it("B–D: without the add-on (or without a publication) every mutation is 403 before any write", async () => {
    seed({ entitledA: false });
    for (const run of [
      () => createPortalGuest(PORTAL_A.rawToken, body({ displayName: "X", invitationVariant: "GROOM" }), deps()),
      () => updatePortalGuest(PORTAL_A.rawToken, GUEST_A1, body({ displayName: "X" }), deps()),
      () => revokePortalGuest(PORTAL_A.rawToken, GUEST_A1, deps()),
    ]) {
      await expect(run()).rejects.toMatchObject({ kind: "FORBIDDEN" });
    }
    seed({ publishedA: false });
    await expect(revokePortalGuest(PORTAL_A.rawToken, GUEST_A1, deps())).rejects.toMatchObject({ kind: "FORBIDDEN" });
    expect(writes).toEqual([]);
  });

  it("A/E: the server-rendered Portal shows guestTool only when entitled; RSVP rows are read either way", async () => {
    const { buildRendererFixture } = await import("../../../../templates/core/fixtures/renderer-fixture-pipeline");
    const { FIXTURE_TEMPLATE_VERSION_ID } = await import("../../../../templates/core/fixtures/renderer-fixture-sources");
    const snapshot = (await buildRendererFixture({ variant: "COMMON" })).snapshot;
    const record = (entitled: boolean) => ({
      projectCode: snapshot.project.code,
      packageCode: "SEPARATE",
      invitations: [{ id: "11111111-0000-4000-8000-000000000001", variant: "COMMON" as const, publicSlug: "wc-a", publishedVersionId: "22222222-0000-4000-8000-000000000001" }],
      versions: [
        {
          id: "22222222-0000-4000-8000-000000000001",
          invitationId: "11111111-0000-4000-8000-000000000001",
          projectId: PROJECT_A,
          versionType: "PUBLISHED",
          templateVersionId: FIXTURE_TEMPLATE_VERSION_ID,
          rendererKey: snapshot.template.rendererKey,
          payload: snapshot,
        },
      ],
      personalizedGuestEntitled: entitled,
    });
    const rsvp = { typedName: "Lan", attendance: "ATTENDING" as const, partySize: 1, message: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", guest: null };
    const load = (entitled: boolean) =>
      loadCustomerPortal(PORTAL_A.rawToken, {
        resolution: resolution(),
        portal: { getPortalProject: async () => record(entitled), listPortalRsvps: async () => [rsvp] },
        guests: getServiceRolePortalGuestGateway(),
      });
    const off = await load(false);
    expect(off).toMatchObject({ status: "READY", guestTool: null, rsvps: [{ guestName: "Lan" }] });
    const on = await load(true);
    if (on.status !== "READY" || on.guestTool === null) throw new Error("expected guest tool");
    expect(on.guestTool.mode).toBe("GROOM_OR_BRIDE");
    expect(on.guestTool.guests.map((g) => g.displayName)).toEqual(["Anh Hiếu và gia đình", "Chú B và người thương"]);
    expect(on.rsvps).toHaveLength(1);
  });
});

describe("033E-A F–P: create", () => {
  it("F/G: COMMON package — the server writes COMMON; GROOM/BRIDE/unknown variants are 400", async () => {
    seed({ packageA: "COMMON" });
    // COMMON package needs a COMMON invitation for the composite FK; the fake does not enforce FKs.
    const row = await createPortalGuest(PORTAL_A.rawToken, body({ displayName: "  Em và sự cô đơn  " }), deps());
    expect(row).toMatchObject({ displayName: "Em và sự cô đơn", invitationVariant: "COMMON", status: "ACTIVE", linkStatus: "NOT_ISSUED" });
    expect(writes[0].payload).toMatchObject({ project_id: PROJECT_A, invitation_variant: "COMMON" });
    expect(await createPortalGuest(PORTAL_A.rawToken, body({ displayName: "B", invitationVariant: "COMMON" }), deps())).toMatchObject({ invitationVariant: "COMMON" });
    for (const invitationVariant of ["GROOM", "BRIDE", "X", null]) {
      await expect(createPortalGuest(PORTAL_A.rawToken, body({ displayName: "C", invitationVariant }), deps())).rejects.toMatchObject({ kind: "BAD_REQUEST" });
    }
  });

  it("H–K: SEPARATE package — explicit GROOM or BRIDE; missing, null, COMMON or unknown sides are 400 (never defaulted)", async () => {
    expect(await createPortalGuest(PORTAL_A.rawToken, body({ displayName: "Nhà trai 1", invitationVariant: "GROOM" }), deps())).toMatchObject({ invitationVariant: "GROOM" });
    expect(await createPortalGuest(PORTAL_A.rawToken, body({ displayName: "Nhà gái 1", invitationVariant: "BRIDE" }), deps())).toMatchObject({ invitationVariant: "BRIDE" });
    for (const value of [{ displayName: "x" }, { displayName: "x", invitationVariant: null }, { displayName: "x", invitationVariant: "COMMON" }, { displayName: "x", invitationVariant: "groom" }]) {
      await expect(createPortalGuest(PORTAL_A.rawToken, body(value), deps())).rejects.toMatchObject({ kind: "BAD_REQUEST" });
    }
    expect(writes).toHaveLength(2);
  });

  it("L–N: blank/whitespace, >200 code points, extra keys (projectId, phone…) and non-objects are 400; 200 Vietnamese code points pass; duplicates are allowed", async () => {
    const long = "Ệ".repeat(200);
    expect(await createPortalGuest(PORTAL_A.rawToken, body({ displayName: long, invitationVariant: "GROOM" }), deps())).toMatchObject({ displayName: long });
    expect(await createPortalGuest(PORTAL_A.rawToken, body({ displayName: "Anh Hiếu và gia đình", invitationVariant: "GROOM" }), deps())).toMatchObject({ status: "ACTIVE" });
    for (const value of [
      { displayName: "", invitationVariant: "GROOM" },
      { displayName: "   ", invitationVariant: "GROOM" },
      { displayName: "Ệ".repeat(201), invitationVariant: "GROOM" },
      { displayName: "x", invitationVariant: "GROOM", projectId: PROJECT_B },
      { displayName: "x", invitationVariant: "GROOM", phone: "1" },
      ["x"],
      null,
    ]) {
      await expect(createPortalGuest(PORTAL_A.rawToken, body(value), deps())).rejects.toMatchObject({ kind: "BAD_REQUEST" });
    }
  });

  it("O/P: the insert persists only a 32-byte dormant hash with no hint/issued/revoked/creator; nothing token-like is returned", async () => {
    const row = await createPortalGuest(PORTAL_A.rawToken, body({ displayName: "Team Marketing", invitationVariant: "BRIDE" }), deps());
    const payload = writes[0].payload;
    expect(payload.token_hash).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(payload).toMatchObject({ token_hint: null, token_issued_at: null, revoked_at: null, created_by: null });
    expect(Object.keys(payload).sort()).toEqual(["created_by", "display_name", "invitation_variant", "project_id", "revoked_at", "token_hash", "token_hint", "token_issued_at"]);
    expect(Object.keys(row).sort()).toEqual(["displayName", "guestId", "invitationVariant", "linkStatus", "status"]);
    expect(JSON.stringify(row)).not.toMatch(/token|hash|hint|issued_at|\\x/i);
    expect(read("lib/server/auth/dormant-guest-token.ts")).toMatch(/return generateAccessToken\(\)\.tokenHash;/);
  });
});

describe("033E-A Q–U, AK: Project pinning", () => {
  it("Q/R: the list is the resolved Project's only; a foreign row fails the guard", async () => {
    const list = await getServiceRolePortalGuestGateway().listGuests(PROJECT_A);
    expect(list.map((g) => g.id)).toEqual([GUEST_A1, GUEST_A2]);
    expect(() => toPortalGuestRecord(db.guests[2], PROJECT_A)).toThrow();
  });

  it("S/T/U/AK: Project A token + Project B guest id → 404 for edit and revoke, B untouched; malformed id 404; no token → 401; no Project id input exists", async () => {
    const before = JSON.stringify(guest(GUEST_B1));
    await expect(updatePortalGuest(PORTAL_A.rawToken, GUEST_B1, body({ displayName: "hijack" }), deps())).rejects.toMatchObject({ kind: "NOT_FOUND" });
    await expect(revokePortalGuest(PORTAL_A.rawToken, GUEST_B1, deps())).rejects.toMatchObject({ kind: "NOT_FOUND" });
    await expect(revokePortalGuest(PORTAL_A.rawToken, "not-a-uuid", deps())).rejects.toMatchObject({ kind: "NOT_FOUND" });
    expect(JSON.stringify(guest(GUEST_B1))).toBe(before);
    expect((await handleRevokePortalGuestRequest(null, GUEST_A1, deps())).status).toBe(401);
    expect(guest(GUEST_A1).revoked_at).toBeNull();
    for (const bad of [REVIEW_A.rawToken, generateAccessToken().rawToken, PROJECT_A, "wc-a-common"]) {
      await expect(revokePortalGuest(bad, GUEST_A1, deps())).rejects.toMatchObject({ kind: "NOT_FOUND" });
    }
    expect(createPortalGuest.length).toBe(3);
    expect(revokePortalGuest.length).toBe(3);
  });
});

describe("033E-A V–AA: edit", () => {
  it("V/W: display name changes before and after issuance; no token field is written and issuance state is unchanged", async () => {
    expect(await updatePortalGuest(PORTAL_A.rawToken, GUEST_A1, body({ displayName: "Anh Hiếu" }), deps())).toMatchObject({ displayName: "Anh Hiếu", linkStatus: "NOT_ISSUED" });
    expect(await updatePortalGuest(PORTAL_A.rawToken, GUEST_A2, body({ displayName: "Chú B" }), deps())).toMatchObject({ displayName: "Chú B", linkStatus: "ISSUED" });
    expect(guest(GUEST_A2)).toMatchObject({ token_hint: "hint1234", token_issued_at: "2026-10-04T00:00:00Z" });
    for (const w of writes) expect(Object.keys(w.payload).filter((k) => /token|revoked|project|phone|note|group/.test(k))).toEqual([]);
  });

  it("X/Y/Z: side changes while unissued; after issuance a different side is 409 SIDE_LOCKED (nothing written) and the same side succeeds", async () => {
    expect(await updatePortalGuest(PORTAL_A.rawToken, GUEST_A1, body({ displayName: "A1", invitationVariant: "BRIDE" }), deps())).toMatchObject({ invitationVariant: "BRIDE" });
    await expect(updatePortalGuest(PORTAL_A.rawToken, GUEST_A2, body({ displayName: "A2", invitationVariant: "GROOM" }), deps())).rejects.toMatchObject({ kind: "CONFLICT", reason: "SIDE_LOCKED" });
    expect(guest(GUEST_A2)).toMatchObject({ display_name: "Chú B và người thương", invitation_variant: "BRIDE" });
    expect(await updatePortalGuest(PORTAL_A.rawToken, GUEST_A2, body({ displayName: "A2", invitationVariant: "BRIDE" }), deps())).toMatchObject({ displayName: "A2", invitationVariant: "BRIDE" });
  });

  it("AA: a revoked guest cannot be edited (409 GUEST_REVOKED)", async () => {
    guest(GUEST_A1).revoked_at = "2026-10-05T00:00:00Z";
    await expect(updatePortalGuest(PORTAL_A.rawToken, GUEST_A1, body({ displayName: "x" }), deps())).rejects.toMatchObject({ reason: "GUEST_REVOKED" });
    expect(guest(GUEST_A1).display_name).toBe("Anh Hiếu và gia đình");
  });
});

describe("033E-A AB–AF: revoke", () => {
  it("AB/AC/AD/AE: revoke sets revoked_at only; repeat is 409 ALREADY_REVOKED; no DELETE; RSVP rows untouched", async () => {
    const rsvpsBefore = JSON.stringify(db.rsvps);
    expect(await revokePortalGuest(PORTAL_A.rawToken, GUEST_A2, deps())).toMatchObject({ status: "REVOKED", linkStatus: "ISSUED" });
    expect(Object.keys(writes[0].payload)).toEqual(["revoked_at"]);
    await expect(revokePortalGuest(PORTAL_A.rawToken, GUEST_A2, deps())).rejects.toMatchObject({ reason: "ALREADY_REVOKED" });
    expect(db.guests).toHaveLength(3);
    expect(writes.some((w) => w.op === "delete" || w.table !== "guests")).toBe(false);
    expect(JSON.stringify(db.rsvps)).toBe(rsvpsBefore);
  });

  it("AF/§16: frozen 0042 — a revoked guest's issued link renders not-found and its RSVP is rejected; add-on state is never consulted", () => {
    const sql = read("supabase/migrations/20260911041202_0042_personalized_guest_link.sql");
    expect(sql).toMatch(/is_revoked\s+:= v_guest\.revoked_at IS NOT NULL;/);
    expect(sql).toMatch(/IF NOT FOUND OR v_is_revoked THEN\s+RETURN NULL;/);
    expect(sql).toMatch(/IF v_is_revoked THEN\s+RAISE EXCEPTION 'Guest link revoked' USING ERRCODE = 'GT001';/);
    expect(sql).toMatch(/IF NOT FOUND OR v_guest\.token_issued_at IS NULL THEN\s+RETURN;/);
    expect(sql).not.toMatch(/project_addons/);
  });
});

describe("033E-A AG–AO: boundaries and UI", () => {
  const NEW_SERVER = [
    "lib/server/customer-portal/portal-guest-tool.ts",
    "lib/server/customer-portal/portal-guest-types.ts",
    "lib/server/customer-portal/portal-guest-supabase.ts",
    "lib/server/supabase/portal-guest-repository.ts",
    "lib/server/routes/portal-guests.ts",
    "lib/server/auth/dormant-guest-token.ts",
  ];
  const ROUTES = [
    "app/api/v2/public/portal/guests/route.ts",
    "app/api/v2/public/portal/guests/[guestId]/route.ts",
    "app/api/v2/public/portal/guests/[guestId]/revoke/route.ts",
    "app/api/v2/public/portal/guests/[guestId]/access-link/route.ts",
  ];
  const CLIENT = "app/portal/[token]/portal-guest-tool.tsx";

  // Amended by Task 033E-B: ISSUE / REGENERATE now exist (shared issueGuestLink) and the 033B1 replaceGuestToken carries the variant predicate.
  it("AG/AH/AN/AD/AL: no restore/delete; service_role only in the repository; routes only use the wiring", () => {
    const code = [...NEW_SERVER, ...ROUTES, CLIENT].map((f) => strip(read(f))).join("\n");
    // Amended by Task 033E-C: one read-only `rsvps` select is allowed; no RSVP write ever.
    expect(code).not.toMatch(/unrevoke|restore|\.delete\(|\.rpc\(|from\("rsvps"\)\s*\.(insert|update|upsert|delete)|localStorage|sessionStorage|indexedDB|document\.cookie/);
    for (const f of [...NEW_SERVER.filter((f) => !f.endsWith("portal-guest-repository.ts")), ...ROUTES, CLIENT]) {
      expect(read(f), f).not.toMatch(/service-role-client|SUPABASE_SERVICE_ROLE_KEY|createServiceRole/);
    }
    for (const f of ROUTES) expect(strip(read(f)), f).toMatch(/createPortalGuestToolDependencies\(\)/);
    expect(read(CLIENT)).toMatch(/^"use client";/);
    for (const line of read(CLIENT).split("\n").filter((l) => /from "\.\.\/\.\.\/\.\.\/lib\/server/.test(l))) expect(line).toMatch(/^import type /);
    const repo = strip(read("lib/server/supabase/portal-guest-repository.ts"));
    expect(repo).toMatch(/\.or\(`token_issued_at\.is\.null,invitation_variant\.eq\.\$\{side === "GROOM" \? "GROOM" : "BRIDE"\}`\)/);
    for (const select of repo.match(/GUEST_COLUMNS = "[^"]*"/g) ?? []) expect(select).not.toMatch(/token_hash|token_hint|phone|note|group_name|created_by/);
  });

  it("AI/AJ/AM/R: rows carry only guestId as an id, linkStatus is derived, no private field is serialized; Portal metadata unchanged; logs are fixed strings", async () => {
    const rows = await getServiceRolePortalGuestGateway().listGuests(PROJECT_A);
    const { presentPortalGuests } = await import("../portal-guest-tool");
    const view = presentPortalGuests(rows, "GROOM_OR_BRIDE");
    expect(view.map((g) => g.linkStatus)).toEqual(["NOT_ISSUED", "ISSUED"]);
    const json = JSON.stringify(view);
    expect(json.match(UUID)?.sort()).toEqual([GUEST_A1, GUEST_A2].sort());
    expect(json).not.toMatch(/token|hint|issued_at|phone|note|group|Bạn đại học|0900000000|project|2026-10-04/i);
    const page = strip(read("app/portal/[token]/page.tsx"));
    expect(page).toMatch(/title: "Cổng khách hàng — WeddingClick",\s+robots: \{ index: false, follow: false \},\s+referrer: "no-referrer",/);
    expect(page).not.toMatch(/openGraph|generateMetadata/);
    for (const f of [...NEW_SERVER, ...ROUTES, CLIENT]) {
      for (const line of read(f).split("\n").filter((l) => /console\./.test(l))) expect(line, f).toMatch(/console\.error\("\[[A-Za-z]+\] [A-Za-z ]+"\);/);
    }
  });

  it("route handler: 201 create, 409 carries a stable reason, unexpected errors are a fixed 500", async () => {
    const auth = `Bearer ${PORTAL_A.rawToken}`;
    expect((await handleCreatePortalGuestRequest(auth, body({ displayName: "Mới", invitationVariant: "GROOM" }), deps())).status).toBe(201);
    const locked = await handleUpdatePortalGuestRequest(auth, GUEST_A2, body({ displayName: "x", invitationVariant: "GROOM" }), deps());
    expect(locked).toMatchObject({ status: 409, body: { reason: "SIDE_LOCKED" }, headers: { "Cache-Control": "no-store" } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...deps(), guests: { ...getServiceRolePortalGuestGateway(), getGuestToolContext: async () => Promise.reject(new Error("db detail secret")) } };
    expect(await handleRevokePortalGuestRequest(auth, GUEST_A1, broken)).toMatchObject({ status: 500, body: { error: "Internal server error" } });
    expect(errorSpy).toHaveBeenCalledWith("[handlePortalGuestRequest] Unexpected error");
    errorSpy.mockRestore();
  });

  // Amended by Task 033E-B: active rows now carry "Tạo link" / "Tạo lại link"; a raw link / copy control never comes from server props.
  it("AO: active / revoked / empty states; COMMON has no side picker; link actions per state, no raw link or copy control from props", async () => {
    const { PortalGuestTool } = await import("../../../../app/portal/[token]/portal-guest-tool");
    const rows = [
      { guestId: GUEST_A1, displayName: "Anh Hiếu và gia đình", invitationVariant: "GROOM" as const, status: "ACTIVE" as const, linkStatus: "NOT_ISSUED" as const, rsvpStatus: "NOT_RESPONDED" as const, rsvpPartySize: null },
      { guestId: GUEST_A2, displayName: "Chú B và người thương", invitationVariant: "BRIDE" as const, status: "ACTIVE" as const, linkStatus: "ISSUED" as const, rsvpStatus: "NOT_RESPONDED" as const, rsvpPartySize: null },
      { guestId: GUEST_B1, displayName: "Đã đi xa", invitationVariant: "BRIDE" as const, status: "REVOKED" as const, linkStatus: "ISSUED" as const, rsvpStatus: "NOT_RESPONDED" as const, rsvpPartySize: null },
    ];
    const html = renderToStaticMarkup(<PortalGuestTool token="t" mode="GROOM_OR_BRIDE" guests={rows} />);
    for (const text of ["Danh sách khách mời", "Thêm khách", "Thiệp nhà trai · Chưa cấp link", "Thiệp nhà gái · Đã cấp link", "Sửa", "Thu hồi", "Đã thu hồi — link không còn hiệu lực"]) expect(html).toContain(text);
    expect(html.match(/>Thu hồi</g)).toHaveLength(2);
    expect(html).not.toMatch(/Sao chép|\/g\/|Khôi phục|Xoá khách|QR|Excel|CSV/);
    expect(html.match(/>Tạo link</g)).toHaveLength(1);
    expect(html.match(/>Tạo lại link</g)).toHaveLength(1);
    const empty = renderToStaticMarkup(<PortalGuestTool token="t" mode="COMMON_ONLY" guests={[]} />);
    expect(empty).toContain("Chưa có khách mời nào.");
    expect(empty).not.toMatch(/Nhà trai|Nhà gái|type="radio"/);
  });
});

// ---------------------------------------------------------------------------
// Task 033E-B — Portal personalized guest link ISSUE / REGENERATE
// ---------------------------------------------------------------------------

const LINK = /^\/i\/([a-z0-9-]+)\/g\/([A-Za-z0-9_-]{43})$/;
const action = (value: string) => body({ action: value });
const issuePortal = (token: string, guestId: string, act: string, d = deps()) => issuePortalGuestLink(token, guestId, action(act), d);
const tokenOf = (path: string) => LINK.exec(path)![2];
const tokenWrites = () => writes.filter((w) => "token_hash" in w.payload);

/** Mirrors 0042 resolve_public_guest: published slug, issued hash, same Project, permitted variant, active. */
function resolvesTo(path: string): string | null {
  const match = LINK.exec(path);
  if (match === null) return null;
  const inv = db.project_invitations.find((row) => row.public_slug === match[1] && row.published_version_id !== null);
  if (inv === undefined) return null;
  const hash = "\\x" + hex(hashAccessToken(match[2]));
  const g = db.guests.find((row) => row.token_hash === hash && row.token_issued_at !== null);
  if (g === undefined || g.project_id !== inv.project_id || g.revoked_at !== null) return null;
  const pkg = db.projects.find((p) => p.id === g.project_id)?.package_code_snapshot;
  const variant = g.invitation_variant ?? (pkg === "COMMON" ? "COMMON" : null);
  return variant === inv.variant ? (g.id as string) : null;
}

describe("033E-B A–U: Portal ISSUE / REGENERATE", () => {
  it("A/Q/R/U: entitled Portal ISSUEs a dormant guest: fresh hash + hint + issued_at, raw token only in the response URL", async () => {
    const before = guest(GUEST_A1).token_hash;
    const issued = await issuePortal(PORTAL_A.rawToken, GUEST_A1, "ISSUE");
    expect(Object.keys(issued).sort()).toEqual(["linkStatus", "personalizedUrl"]);
    expect(issued.linkStatus).toBe("ISSUED");
    expect(LINK.exec(issued.personalizedUrl)?.[1]).toBe("wc-a-groom");
    const raw = tokenOf(issued.personalizedUrl);
    expect(guest(GUEST_A1)).toMatchObject({ token_hash: "\\x" + hex(hashAccessToken(raw)), token_hint: raw.slice(-8) });
    expect(guest(GUEST_A1).token_hash).not.toBe(before);
    expect(guest(GUEST_A1).token_issued_at).not.toBeNull();
    expect(JSON.stringify(db)).not.toContain(raw);
    expect(JSON.stringify(writes)).not.toContain(raw);
    expect(JSON.stringify(issued)).not.toMatch(UUID);
    expect(JSON.stringify(issued)).not.toMatch(/hash|hint|issued_at|project/i);
    expect(resolvesTo(issued.personalizedUrl)).toBe(GUEST_A1);
  });

  it("B/D: without PERSONALIZED_GUEST both ISSUE and REGENERATE are 403 and nothing is written", async () => {
    seed({ entitledA: false });
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_A1, "ISSUE")).rejects.toMatchObject({ kind: "FORBIDDEN" });
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_A2, "REGENERATE")).rejects.toMatchObject({ kind: "FORBIDDEN" });
    expect(writes).toEqual([]);
  });

  it("C/S/T: REGENERATE replaces hash/hint/issued_at; the old link stops resolving at once, the new one resolves", async () => {
    const first = await issuePortal(PORTAL_A.rawToken, GUEST_A1, "ISSUE");
    const firstHash = guest(GUEST_A1).token_hash;
    const second = await issuePortal(PORTAL_A.rawToken, GUEST_A1, "REGENERATE");
    expect(second.personalizedUrl).not.toBe(first.personalizedUrl);
    expect(guest(GUEST_A1).token_hash).not.toBe(firstHash);
    expect(guest(GUEST_A1).token_hint).toBe(tokenOf(second.personalizedUrl).slice(-8));
    expect(resolvesTo(first.personalizedUrl)).toBeNull();
    expect(resolvesTo(second.personalizedUrl)).toBe(GUEST_A1);
    expect(db.guests.filter((g) => g.id === GUEST_A1)).toHaveLength(1);
  });

  it("E: a revoked guest can neither ISSUE nor REGENERATE (409 GUEST_REVOKED, nothing rotated)", async () => {
    guest(GUEST_A1).revoked_at = "2026-10-05T00:00:00Z";
    guest(GUEST_A2).revoked_at = "2026-10-05T00:00:00Z";
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_A1, "ISSUE")).rejects.toMatchObject({ kind: "CONFLICT", reason: "GUEST_REVOKED" });
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_A2, "REGENERATE")).rejects.toMatchObject({ kind: "CONFLICT", reason: "GUEST_REVOKED" });
    expect(tokenWrites()).toEqual([]);
  });

  it("F/G: Project A token + Project B guest (or malformed id) is 404; a browser projectId is rejected, never consulted", async () => {
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_B1, "ISSUE")).rejects.toMatchObject({ kind: "NOT_FOUND" });
    await expect(issuePortal(PORTAL_A.rawToken, "not-a-uuid", "ISSUE")).rejects.toMatchObject({ kind: "NOT_FOUND" });
    for (const extra of [{ projectId: PROJECT_B }, { projectId: PROJECT_A }, { guestId: GUEST_B1 }]) {
      await expect(issuePortalGuestLink(PORTAL_A.rawToken, GUEST_A1, body({ action: "ISSUE", ...extra }), deps())).rejects.toMatchObject({ kind: "BAD_REQUEST" });
    }
    expect(issuePortalGuestLink.length).toBe(4);
    expect(tokenWrites()).toEqual([]);
  });

  it("H: REVIEW token, unknown token and a guest's own issued token are not Portal auth (404)", async () => {
    const issued = await issuePortal(PORTAL_A.rawToken, GUEST_A1, "ISSUE");
    writes = [];
    for (const bad of [REVIEW_A.rawToken, generateAccessToken().rawToken, tokenOf(issued.personalizedUrl)]) {
      await expect(issuePortal(bad, GUEST_A1, "REGENERATE")).rejects.toMatchObject({ kind: "NOT_FOUND" });
    }
    expect(tokenWrites()).toEqual([]);
  });

  it("I/J: ISSUE only while not issued, REGENERATE only once issued; the stale action is 409 from DB state", async () => {
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_A2, "ISSUE")).rejects.toMatchObject({ kind: "CONFLICT", reason: "CONCURRENT_CHANGE" });
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_A1, "REGENERATE")).rejects.toMatchObject({ kind: "CONFLICT", reason: "CONCURRENT_CHANGE" });
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_A1, "RESET")).rejects.toMatchObject({ kind: "BAD_REQUEST" });
    expect(tokenWrites()).toEqual([]);
    expect(guest(GUEST_A2).token_hint).toBe("hint1234");
  });

  it("K: both gateways rotate in ONE conditional UPDATE that also pins invitation_variant; the use case passes the stored variant", () => {
    for (const f of ["lib/server/supabase/guest-link-staff-repository.ts", "lib/server/supabase/portal-guest-repository.ts"]) {
      const src = strip(read(f));
      const replace = src.slice(src.lastIndexOf("async replaceGuestToken"));
      expect(replace, f).toMatch(/\.is\("revoked_at", null\)/);
      expect(replace, f).toMatch(/variant === null \? issuance\.is\("invitation_variant", null\) : issuance\.eq\("invitation_variant", variant\)/);
      expect(replace.match(/\.update\(/g), f).toHaveLength(1);
    }
    expect(strip(read("lib/server/guest-links/issue-guest-link.ts"))).toMatch(/expectedInvitationVariant: target\.invitationVariant/);
  });

  it("L: a side change between read and rotation → 409, nothing written, no dead link (Portal and staff gateways)", async () => {
    const portal = getServiceRolePortalGuestLinkGateway();
    const racing = { ...deps(), guestLinks: { ...portal, getInvitationSlug: async (...a: Parameters<typeof portal.getInvitationSlug>) => {
      guest(GUEST_A1).invitation_variant = "BRIDE";
      return portal.getInvitationSlug(...a);
    } } };
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_A1, "ISSUE", racing)).rejects.toMatchObject({ kind: "CONFLICT", reason: "CONCURRENT_CHANGE" });
    expect(guest(GUEST_A1)).toMatchObject({ token_issued_at: null, token_hint: null });

    const client = fakeClient();
    const staff = { ...supabaseGuestLinkStaffGateway, getInvitationSlug: async (...a: Parameters<typeof supabaseGuestLinkStaffGateway.getInvitationSlug>) => {
      guest(GUEST_A2).invitation_variant = "GROOM";
      return supabaseGuestLinkStaffGateway.getInvitationSlug(...a);
    } };
    await expect(issueGuestLink(PROJECT_A, GUEST_A2, { action: "REGENERATE" }, client as never, staff)).rejects.toMatchObject({ kind: "CONFLICT" });
    expect(guest(GUEST_A2).token_hint).toBe("hint1234");
  });

  it("M/N/O: COMMON → COMMON slug (also NULL variant on a COMMON package); GROOM → groom slug; BRIDE → bride slug", async () => {
    const common = await issuePortal(PORTAL_B.rawToken, GUEST_B1, "ISSUE");
    expect(LINK.exec(common.personalizedUrl)?.[1]).toBe("wc-b-common");
    guest(GUEST_B1).invitation_variant = null;
    const nullCommon = await issuePortal(PORTAL_B.rawToken, GUEST_B1, "REGENERATE");
    expect(LINK.exec(nullCommon.personalizedUrl)?.[1]).toBe("wc-b-common");
    expect(resolvesTo(nullCommon.personalizedUrl)).toBe(GUEST_B1);
    expect(LINK.exec((await issuePortal(PORTAL_A.rawToken, GUEST_A1, "ISSUE")).personalizedUrl)?.[1]).toBe("wc-a-groom");
    const bride = await issuePortal(PORTAL_A.rawToken, GUEST_A2, "REGENERATE");
    expect(LINK.exec(bride.personalizedUrl)?.[1]).toBe("wc-a-bride");
    expect(resolvesTo(bride.personalizedUrl)).toBe(GUEST_A2);
    expect(bride.personalizedUrl).not.toMatch(/\?guest=|f0000000/);
  });

  it("P: the guest's own variant must be PUBLISHED (422, no fallback); a pointer integrity fault is a fixed 500", async () => {
    seed({ publishedBrideA: false });
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_A2, "REGENERATE")).rejects.toMatchObject({ kind: "INVARIANT" });
    guest(GUEST_A1).invitation_variant = null;
    await expect(issuePortal(PORTAL_A.rawToken, GUEST_A1, "ISSUE")).rejects.toMatchObject({ kind: "INVARIANT" });
    expect(tokenWrites()).toEqual([]);
    seed();
    db.invitation_versions[2].version_type = "REVIEW";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleIssuePortalGuestLinkRequest(`Bearer ${PORTAL_A.rawToken}`, GUEST_A2, action("REGENERATE"), deps());
    expect(res).toMatchObject({ status: 500, body: { error: "Internal server error" } });
    expect(errorSpy).toHaveBeenCalledWith("[handlePortalGuestRequest] Unexpected error");
    errorSpy.mockRestore();
    expect(tokenWrites()).toEqual([]);
  });

  it("route handler: 200 { data: { personalizedUrl, linkStatus } } no-store; 401 without Bearer; 409 reason; 422 unpublished", async () => {
    const auth = `Bearer ${PORTAL_A.rawToken}`;
    const ok = await handleIssuePortalGuestLinkRequest(auth, GUEST_A1, action("ISSUE"), deps());
    expect(ok).toMatchObject({ status: 200, headers: { "Cache-Control": "no-store" } });
    expect(Object.keys((ok.body as { data: object }).data).sort()).toEqual(["linkStatus", "personalizedUrl"]);
    expect((await handleIssuePortalGuestLinkRequest(null, GUEST_A1, action("REGENERATE"), deps())).status).toBe(401);
    expect(await handleIssuePortalGuestLinkRequest(auth, GUEST_A1, action("ISSUE"), deps())).toMatchObject({ status: 409, body: { reason: "CONCURRENT_CHANGE" } });
    seed({ publishedBrideA: false });
    expect((await handleIssuePortalGuestLinkRequest(auth, GUEST_A2, action("REGENERATE"), deps())).status).toBe(422);
    const route = strip(read("app/api/v2/public/portal/guests/[guestId]/access-link/route.ts"));
    expect(route).toMatch(/handleIssuePortalGuestLinkRequest\(\s*request\.headers\.get\("authorization"\),\s*guestId,/);
    expect(route).not.toMatch(/projectId|\bid\b:/);
  });
});

describe("033E-B AG–AI: staff path, resolver and RSVP preserved", () => {
  it("AG: real staff gateway still ISSUEs / REGENERATEs (no publish requirement), blocks revoked, rejects stale actions", async () => {
    seed({ publishedBrideA: false });
    const client = fakeClient() as never;
    const run = (guestId: string, act: string) => issueGuestLink(PROJECT_A, guestId, { action: act }, client, supabaseGuestLinkStaffGateway);
    const issued = await run(GUEST_A1, "ISSUE");
    expect(LINK.exec(issued.invitationPath)?.[1]).toBe("wc-a-groom");
    expect(issued).toMatchObject({ guestId: GUEST_A1, projectId: PROJECT_A, invitationVariant: "GROOM" });
    const regen = await run(GUEST_A2, "REGENERATE");
    expect(LINK.exec(regen.invitationPath)?.[1]).toBe("wc-a-bride");
    await expect(run(GUEST_A1, "ISSUE")).rejects.toMatchObject({ kind: "CONFLICT" });
    guest(GUEST_A1).revoked_at = "2026-10-05T00:00:00Z";
    await expect(run(GUEST_A1, "REGENERATE")).rejects.toMatchObject({ kind: "CONFLICT" });
    db.project_addons = db.project_addons.filter((a) => a.project_id !== PROJECT_A);
    await expect(run(GUEST_A2, "REGENERATE")).rejects.toMatchObject({ kind: "FORBIDDEN" });
    expect(strip(read("lib/server/routes/guest-links.ts"))).toMatch(/requireStaff\(token, authGateway\)[\s\S]*issueGuestLink\(projectId, guestId, body, staff\.supabase, guestLinkGateway\)/);
  });

  it("AH/AI: 0042, the personalized page/loader and personalized RSVP code are byte-identical to the frozen baseline", () => {
    const frozen = [
      "supabase/migrations/20260911041202_0042_personalized_guest_link.sql",
      "app/i/[slug]/g/[token]/page.tsx",
      "lib/server/public-guest",
      "lib/server/public-rsvp",
      "lib/server/supabase/public-guest-repository.ts",
      // app/api/v2/public/rsvp/route.ts: Task 035A wraps it with abuse-control guards only.
      // Task 035B narrowed only this test's "latest migration" checkpoint assertion.
      ":!lib/server/public-guest/__tests__/personalized-guest-link.test.tsx",
    ];
    expect(execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...frozen], { cwd: ROOT, encoding: "utf8" })).toBe("");
    // Task 035B: the only migration allowed after 0042 is the owner-approved legacy V1 lockdown.
    // Launch Hardening 04 (owner-approved checkpoint maintenance): exactly the approved 0044 may follow 0043.
    // TE-03B (checkpoint maintenance): exactly 0046 may follow 0044; 0045 is retired and must stay absent.
    // OWS-04 (checkpoint maintenance): exactly the data-only catalog seed 0047 may follow 0046.
    // DB-CONSISTENCY-01 (checkpoint maintenance): exactly the data-only VH/RM catalog seed 0048 may follow 0047.
    expect(readdirMigrations().slice(-6).map((name) => name.split("/").at(-1))).toEqual([
      "20260911041202_0042_personalized_guest_link.sql",
      "20260911041203_0043_legacy_v1_lockdown.sql",
      "20260911041204_0044_republish_after_published.sql",
      "20260911041206_0046_project_template_media_slots.sql",
      "20260911041207_0047_seed_our_wedding_story_v1_catalog.sql",
      "20260911041208_0048_seed_vietnamese_heritage_romantic_minimal_v1_catalog.sql",
    ]);
  });
});

function readdirMigrations(): string[] {
  return execFileSync("git", ["ls-files", "--others", "--cached", "--exclude-standard", "supabase/migrations"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").sort();
}

describe("033E-B V–AF: Portal UI", () => {
  const CLIENT_SRC = "app/portal/[token]/portal-guest-tool.tsx";

  it("V/W/X/Y/AA/AE/AF: actions per state; in-page regenerate confirmation; no confirm(), storage, query param, QR/import/messaging", async () => {
    const { PortalGuestTool } = await import("../../../../app/portal/[token]/portal-guest-tool");
    const rows = [
      { guestId: GUEST_A1, displayName: "A", invitationVariant: "GROOM" as const, status: "ACTIVE" as const, linkStatus: "NOT_ISSUED" as const, rsvpStatus: "NOT_RESPONDED" as const, rsvpPartySize: null },
      { guestId: GUEST_A2, displayName: "B", invitationVariant: "BRIDE" as const, status: "ACTIVE" as const, linkStatus: "ISSUED" as const, rsvpStatus: "NOT_RESPONDED" as const, rsvpPartySize: null },
      { guestId: GUEST_B1, displayName: "C", invitationVariant: null, status: "ACTIVE" as const, linkStatus: "NOT_ISSUED" as const, rsvpStatus: "NOT_RESPONDED" as const, rsvpPartySize: null },
    ];
    const html = renderToStaticMarkup(<PortalGuestTool token="t" mode="GROOM_OR_BRIDE" guests={rows} />);
    expect(html.match(/>Tạo link</g)).toHaveLength(1);
    expect(html.match(/>Tạo lại link</g)).toHaveLength(1);
    expect(html).not.toMatch(/\/g\/|Sao chép|data-portal-guest-issued-link/);
    const src = strip(read(CLIENT_SRC));
    expect(src).toMatch(/Tạo lại link sẽ làm link cũ không còn hiệu lực\./);
    expect(src).toMatch(/setConfirmRegenerate\(guest\.guestId\)[\s\S]*submitLink\(guest, "ISSUE"\)/);
    expect(src).toMatch(/onClick=\{\(\) => submitLink\(guest, "REGENERATE"\)\}[^>]*>\s*Xác nhận tạo lại/);
    expect(src).not.toMatch(/\bconfirm\(|window\.confirm|localStorage|sessionStorage|indexedDB|document\.cookie|searchParams|history\.|\?link=|QR|qrcode|sms:|zalo|mailto:|csv|xlsx/i);
    expect(src).toMatch(/\/access-link`, "POST", \{ action \}, okText\)/);
    expect(src).not.toMatch(/projectId/);
  });

  it("Z/AD: the one-time panel shows the URL, the one-time warning, copy + close; every new control is ≥44px (min-h-11)", async () => {
    const { IssuedLinkPanel } = await import("../../../../app/portal/[token]/portal-guest-tool");
    const path = `/i/wc-a-groom/g/${"x".repeat(43)}`;
    const html = renderToStaticMarkup(<IssuedLinkPanel link={{ guestId: GUEST_A1, path, regenerated: false }} onClose={() => {}} />);
    expect(html).toContain(`value="${path}"`);
    expect(html).toContain("Link này chỉ hiển thị một lần. Hãy sao chép và gửi cho khách mời.");
    expect(html).not.toContain("Đã sao chép");
    const regen = renderToStaticMarkup(<IssuedLinkPanel link={{ guestId: GUEST_A1, path, regenerated: true }} onClose={() => {}} />);
    expect(regen).toContain("Link cũ không còn hiệu lực");
    const src = read(CLIENT_SRC);
    for (const label of ["Sao chép link", "Đóng", "Xác nhận tạo lại", "Tạo lại link\" : \"Tạo link"]) {
      const at = src.indexOf(label);
      expect(at, label).toBeGreaterThan(0);
      const opening = src.lastIndexOf("<button", at);
      expect(src.slice(opening, at), label).toMatch(/min-h-11/);
    }
    const regenerateCancel = src.slice(src.indexOf("data-portal-guest-regenerate-confirm"), src.indexOf(") : confirmRevoke ==="));
    expect(regenerateCancel).toMatch(/<button [^\n]*min-h-11[^\n]*>\s*Huỷ/);
  });

  it("AB/AC: copy reports COPIED only after the clipboard write resolved; a rejection or missing API is FAILED", async () => {
    const { copyPersonalizedLink } = await import("../../../../app/portal/[token]/portal-guest-tool");
    const written: string[] = [];
    expect(await copyPersonalizedLink(async (text) => void written.push(text), "https://x/i/s/g/t")).toBe("COPIED");
    expect(written).toEqual(["https://x/i/s/g/t"]);
    expect(await copyPersonalizedLink(() => Promise.reject(new Error("denied")), "u")).toBe("FAILED");
    expect(await copyPersonalizedLink(undefined, "u")).toBe("FAILED");
    expect(strip(read(CLIENT_SRC))).toMatch(/copy === "COPIED" \? "Đã sao chép" : copy === "FAILED"/);
  });
});

// ---------------------------------------------------------------------------
// Task 033E-C — per-guest RSVP status (read-only)
// ---------------------------------------------------------------------------

const GENERIC_SAME_NAME = { id: "44444444-0000-4000-8000-000000000002", project_id: PROJECT_A, guest_id: null, guest_display_name_snapshot: "Anh Hiếu và gia đình", attendance: "ATTENDING", party_size: 3 };
const FOREIGN_RSVP = { id: "44444444-0000-4000-8000-000000000003", project_id: PROJECT_B, guest_id: GUEST_B1, attendance: "MAYBE", party_size: 1 };
const listRows = async (projectId = PROJECT_A) => {
  const gw = getServiceRolePortalGuestGateway();
  return attachGuestRsvpStatuses(presentPortalGuests(await gw.listGuests(projectId), "GROOM_OR_BRIDE"), await gw.listGuestRsvps(projectId));
};
const bare = (guestId: string) => ({ guestId, displayName: "Khách", invitationVariant: "BRIDE" as const, status: "ACTIVE" as const, linkStatus: "ISSUED" as const });
const byId = (rows: Awaited<ReturnType<typeof listRows>>, id: string) => rows.find((r) => r.guestId === id)!;
const row = (guestId: string, rsvpStatus: "NOT_RESPONDED" | "ATTENDING" | "MAYBE" | "NOT_ATTENDING", rsvpPartySize: number | null, status: "ACTIVE" | "REVOKED" = "ACTIVE") => ({
  guestId,
  displayName: `Khách ${guestId.slice(-2)}`,
  invitationVariant: "BRIDE" as const,
  status,
  linkStatus: "ISSUED" as const,
  rsvpStatus,
  rsvpPartySize,
});

describe("033E-C A–Q: per-guest RSVP status projection", () => {
  it("A/B/E/H/I/N/O: joined only by guest_id; generic same-name row never attaches; dormant + issued guests can be NOT_RESPONDED", async () => {
    db.rsvps.push(GENERIC_SAME_NAME, FOREIGN_RSVP);
    let rows = await listRows();
    expect(byId(rows, GUEST_A2)).toMatchObject({ linkStatus: "ISSUED", rsvpStatus: "ATTENDING", rsvpPartySize: 2 });
    expect(byId(rows, GUEST_A1)).toMatchObject({ linkStatus: "NOT_ISSUED", rsvpStatus: "NOT_RESPONDED", rsvpPartySize: null });
    db.rsvps = [GENERIC_SAME_NAME];
    rows = await listRows();
    expect(rows.map((r) => r.rsvpStatus)).toEqual(["NOT_RESPONDED", "NOT_RESPONDED"]);
    expect(byId(rows, GUEST_A2).linkStatus).toBe("ISSUED");
    expect(writes).toEqual([]);
  });

  it("C/D/F/G: MAYBE and ATTENDING carry a count; NOT_ATTENDING never carries 0", () => {
    const base = [GUEST_A1, GUEST_A2, GUEST_B1].map(bare);
    const rows = attachGuestRsvpStatuses(base, [
      { guestId: GUEST_A1, attendance: "MAYBE", partySize: 3 },
      { guestId: GUEST_A2, attendance: "NOT_ATTENDING", partySize: 0 },
      { guestId: GUEST_B1, attendance: "ATTENDING", partySize: 1 },
    ]);
    expect(rows.map((r) => [r.rsvpStatus, r.rsvpPartySize])).toEqual([["MAYBE", 3], ["NOT_ATTENDING", null], ["ATTENDING", 1]]);
  });

  it("J/K/L: foreign Project rows are never read; unknown guest, duplicate, bad attendance or party size fail closed", async () => {
    db.rsvps.push(FOREIGN_RSVP);
    expect((await getServiceRolePortalGuestGateway().listGuestRsvps(PROJECT_A)).map((r) => r.guestId)).toEqual([GUEST_A2]);
    expect(() => toPortalGuestRsvpRecord({ ...FOREIGN_RSVP }, PROJECT_A)).toThrow();
    for (const bad of [{ attendance: "YES" }, { attendance: null }, { guest_id: null }, { guest_id: "x" }, { party_size: "2" }, { party_size: 1.5 }]) {
      expect(() => toPortalGuestRsvpRecord({ project_id: PROJECT_A, guest_id: GUEST_A1, attendance: "ATTENDING", party_size: 2, ...bad }, PROJECT_A)).toThrow();
    }
    const base = [GUEST_A1].map(bare);
    for (const rsvps of [
      [{ guestId: GUEST_B1, attendance: "ATTENDING" as const, partySize: 1 }],
      [{ guestId: GUEST_A1, attendance: "ATTENDING" as const, partySize: 1 }, { guestId: GUEST_A1, attendance: "MAYBE" as const, partySize: 1 }],
      [{ guestId: GUEST_A1, attendance: "NOT_ATTENDING" as const, partySize: 2 }],
      [{ guestId: GUEST_A1, attendance: "ATTENDING" as const, partySize: 0 }],
      [{ guestId: GUEST_A1, attendance: "MAYBE" as const, partySize: 21 }],
    ]) {
      expect(() => attachGuestRsvpStatuses(base, rsvps)).toThrow("Guest RSVP integrity fault");
    }
  });

  it("M/W: a revoked guest keeps its historical status; an updated row shows the latest attendance on the next read", async () => {
    await revokePortalGuest(PORTAL_A.rawToken, GUEST_A2, deps());
    expect(byId(await listRows(), GUEST_A2)).toMatchObject({ status: "REVOKED", rsvpStatus: "ATTENDING", rsvpPartySize: 2 });
    Object.assign(db.rsvps[0], { attendance: "NOT_ATTENDING", party_size: 0 });
    expect(byId(await listRows(), GUEST_A2)).toMatchObject({ rsvpStatus: "NOT_ATTENDING", rsvpPartySize: null });
    expect(writes.filter((w) => w.table === "rsvps")).toEqual([]);
  });

  it("P/Q/truncation: the read selects four columns, personalized only, exact count; rows serialize no RSVP id, message, name, time or project", async () => {
    db.rsvps[0] = { ...db.rsvps[0], message: "Chúc mừng!", guest_display_name_snapshot: "Tên gõ", created_at: "2026-10-05T01:02:03Z" };
    const json = JSON.stringify(await listRows());
    expect(json).not.toMatch(/44444444|Chúc mừng|Tên gõ|2026-10-05|message|snapshot|created|updated|project|rsvpId/i);
    expect(Object.keys((await listRows())[0]).sort()).toEqual(["displayName", "guestId", "invitationVariant", "linkStatus", "rsvpPartySize", "rsvpStatus", "status"]);
    const repo = strip(read("lib/server/supabase/portal-guest-repository.ts"));
    const fn = repo.slice(repo.indexOf("async listGuestRsvps"));
    expect(fn).toMatch(/\.from\("rsvps"\)\s*\.select\("project_id, guest_id, attendance, party_size", \{ count: "exact" \}\)\s*\.eq\("project_id", projectId\)\s*\.not\("guest_id", "is", null\)/);
    expect(fn).toMatch(/if \(rows\.count !== rows\.data\.length\) fail\(\);/);
    expect(repo.match(/from\("rsvps"\)/g)).toHaveLength(1);
  });
});

describe("033E-C R–X: loader, entitlement, 033D and UI", () => {
  it("R/S/X: entitled → per-guest statuses + 033D list incl. generic row; not entitled → no Guest Tool, no guest RSVP read, 033D intact", async () => {
    const { buildRendererFixture } = await import("../../../../templates/core/fixtures/renderer-fixture-pipeline");
    const { FIXTURE_TEMPLATE_VERSION_ID } = await import("../../../../templates/core/fixtures/renderer-fixture-sources");
    const snapshot = (await buildRendererFixture({ variant: "COMMON" })).snapshot;
    const record = (entitled: boolean) => ({
      projectCode: snapshot.project.code,
      packageCode: "SEPARATE",
      invitations: [{ id: "11111111-0000-4000-8000-000000000001", variant: "COMMON" as const, publicSlug: "wc-a", publishedVersionId: "22222222-0000-4000-8000-000000000001" }],
      versions: [{ id: "22222222-0000-4000-8000-000000000001", invitationId: "11111111-0000-4000-8000-000000000001", projectId: PROJECT_A, versionType: "PUBLISHED", templateVersionId: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: snapshot.template.rendererKey, payload: snapshot }],
      personalizedGuestEntitled: entitled,
    });
    const generic = { typedName: "Anh Hiếu và gia đình", attendance: "ATTENDING" as const, partySize: 3, message: "Hẹn gặp", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", guest: null };
    const gw = getServiceRolePortalGuestGateway();
    const rsvpReads: string[] = [];
    const load = (entitled: boolean) =>
      loadCustomerPortal(PORTAL_A.rawToken, {
        resolution: resolution(),
        portal: { getPortalProject: async () => record(entitled), listPortalRsvps: async () => [generic] },
        guests: { listGuests: gw.listGuests, listGuestRsvps: async (id: string) => (rsvpReads.push(id), gw.listGuestRsvps(id)) },
      });
    const on = await load(true);
    if (on.status !== "READY" || on.guestTool === null) throw new Error("expected guest tool");
    expect(on.guestTool.guests.map((g) => [g.displayName, g.rsvpStatus, g.rsvpPartySize])).toEqual([
      ["Anh Hiếu và gia đình", "NOT_RESPONDED", null],
      ["Chú B và người thương", "ATTENDING", 2],
    ]);
    expect(on.rsvps).toEqual([expect.objectContaining({ guestName: "Anh Hiếu và gia đình", message: "Hẹn gặp" })]);
    expect(rsvpReads).toEqual([PROJECT_A]);
    const off = await load(false);
    expect(off).toMatchObject({ status: "READY", guestTool: null, rsvps: [{ guestName: "Anh Hiếu và gia đình" }] });
    expect(rsvpReads).toEqual([PROJECT_A]);
  });

  it("V: each status renders compactly (no '0 người', no message); revoked rows keep their status; actions unchanged", async () => {
    const { PortalGuestTool, guestRsvpStatusText } = await import("../../../../app/portal/[token]/portal-guest-tool");
    expect(guestRsvpStatusText("NOT_ATTENDING", 0)).toBe("Không tham dự");
    const rows = [row(GUEST_A1, "NOT_RESPONDED", null), row(GUEST_A2, "ATTENDING", 2), row(GUEST_B1, "MAYBE", 3), row("f0000000-0000-4000-8000-0000000000c1", "NOT_ATTENDING", null), row("f0000000-0000-4000-8000-0000000000c2", "ATTENDING", 4, "REVOKED")];
    const html = renderToStaticMarkup(<PortalGuestTool token="t" mode="GROOM_OR_BRIDE" guests={rows} />);
    for (const text of ["Chưa phản hồi", "Sẽ tham dự · 2 người", "Có thể tham dự · 3 người", "Không tham dự", "Sẽ tham dự · 4 người", "Đã thu hồi — link không còn hiệu lực"]) expect(html).toContain(text);
    expect(html).not.toMatch(/0 người|Lời nhắn|Hẹn gặp/);
    expect(html.match(/data-portal-guest-rsvp="/g)).toHaveLength(5);
    expect(html.match(/>Tạo lại link</g)).toHaveLength(4);
    expect(html.match(/>Sửa</g)).toHaveLength(4);
    expect(strip(read("app/portal/[token]/portal-guest-tool.tsx"))).not.toMatch(/setInterval|EventSource|WebSocket|\.channel\(|subscribe\(/);
  });
});
