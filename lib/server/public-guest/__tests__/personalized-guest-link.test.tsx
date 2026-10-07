import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/font loaders only run under the Next compiler (same mock as the renderer tests).
vi.mock("../../../../templates/wedding/elegant-editorial/v1/fonts", () => ({
  ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables",
}));

const { buildRendererFixture } = await import("../../../../templates/core/fixtures/renderer-fixture-pipeline");
const { FIXTURE_TEMPLATE_VERSION_ID } = await import("../../../../templates/core/fixtures/renderer-fixture-sources");
const { PRODUCTION_COMPATIBILITY_REGISTRY } = await import("../../../../templates/core/production-renderer-manifests");
const { extractSnapshotMediaRefs } = await import("../../../invitation-rendering");
const { generateAccessToken, hashAccessToken } = await import("../../auth/access-token-crypto");
const { ApiError } = await import("../../errors/api-error");
const { loadPublicInvitation } = await import("../../public-invitation/load-public-invitation");
const { handleIssueGuestLinkRequest } = await import("../../routes/guest-links");
const { handleSubmitPublicRsvpRequest } = await import("../../routes/public-rsvp");
const { toPublicGuest } = await import("../../supabase/public-guest-repository");
const { loadPersonalizedPublicInvitation } = await import("../load-personalized-public-invitation");
const { PublicInvitationRenderer, createPublicRsvpCapability } = await import("../../../../app/i/[slug]/public-invitation-renderer");
const personalizedPage = await import("../../../../app/i/[slug]/g/[token]/page");

import type { InvitationVariant } from "../../../domain";
import type { RsvpSubmitInputV1 } from "../../../invitation-rendering/rsvp-capability";
import type { StaffAuthGateway } from "../../auth/staff-context";
import type { GuestLinkGateway, GuestLinkTarget, ReplaceGuestTokenParams } from "../../guest-links/guest-link-types";
import type { PublicInvitationRecord } from "../../public-invitation/public-invitation-types";
import type { PublicRsvpGateway } from "../../public-rsvp/public-rsvp-types";
import type { PublicGuestGateway, PublicGuestRsvpGateway } from "../public-guest-types";

/**
 * Task 033B1 — personalized guest link foundation: opaque token issuance /
 * regeneration (hash only), project-bound resolution with no generic
 * fallback, guest display overlay, guest-bound RSVP upsert.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PROJECT_A = "a0000000-0000-4000-8000-00000000000a";
const PROJECT_B = "b0000000-0000-4000-8000-00000000000b";
const GUEST_ID = "90000000-0000-4000-8000-000000000001";
const SLUG_A = "wc-2026-000001-common";
const SLUG_B = "wc-2026-000002-common";
const DISPLAY_NAME = "Chú Bảy và người thương";
const TOKEN_PATH = /^\/i\/([a-z0-9-]+)\/g\/([A-Za-z0-9_-]{43})$/;
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

// ---------------------------------------------------------------------------
// In-memory model of `guests` (one row) + the 0042 resolution rule, shared by
// the staff gateway fake and the public guest fake.
// ---------------------------------------------------------------------------

interface FakeGuestRow {
  id: string;
  projectId: string;
  displayName: string;
  invitationVariant: InvitationVariant | null;
  tokenHash: string;
  tokenHint: string | null;
  /** 0042 issuance authority; NULL = dormant hash (never a credential). */
  tokenIssuedAt: string | null;
  revoked: boolean;
}

interface FakeAddonRow {
  projectId: string;
  addonCode: string;
  revoked: boolean;
}

function fakeDb(
  overrides: Partial<FakeGuestRow> = {},
  packageCode = "COMMON",
  addons: FakeAddonRow[] = [{ projectId: PROJECT_A, addonCode: "PERSONALIZED_GUEST", revoked: false }],
) {
  const guest: FakeGuestRow = {
    id: GUEST_ID,
    projectId: PROJECT_A,
    displayName: DISPLAY_NAME,
    invitationVariant: "COMMON",
    tokenHash: "00".repeat(32),
    tokenHint: null,
    tokenIssuedAt: null,
    revoked: false,
    ...overrides,
  };
  const slugs: Record<string, { projectId: string; variant: InvitationVariant }> = {
    [SLUG_A]: { projectId: PROJECT_A, variant: "COMMON" },
    [SLUG_B]: { projectId: PROJECT_B, variant: "COMMON" },
  };
  const replaceCalls: ReplaceGuestTokenParams[] = [];

  const staff: GuestLinkGateway<{ marker: string }> = {
    async hasPersonalizedGuestEntitlement(_client, projectId) {
      return addons.some((a) => a.projectId === projectId && a.addonCode === "PERSONALIZED_GUEST" && !a.revoked);
    },
    async getGuestLinkTarget(_client, projectId, guestId): Promise<GuestLinkTarget | null> {
      if (guestId !== guest.id || projectId !== guest.projectId) return null;
      return { invitationVariant: guest.invitationVariant, hasIssuedLink: guest.tokenIssuedAt !== null, revoked: guest.revoked, packageCode };
    },
    async getInvitationSlug(_client, projectId, variant) {
      return Object.entries(slugs).find(([, s]) => s.projectId === projectId && s.variant === variant)?.[0] ?? null;
    },
    async replaceGuestToken(_client, params) {
      replaceCalls.push(params);
      if (params.guestId !== guest.id || params.projectId !== guest.projectId || guest.revoked) return false;
      if ((guest.tokenIssuedAt !== null) !== params.expectIssued) return false;
      guest.tokenHash = hex(params.tokenHash);
      guest.tokenHint = params.tokenHint;
      guest.tokenIssuedAt = new Date().toISOString();
      return true;
    },
  };

  /** Mirrors resolve_public_guest: published slug, issued hash, same Project, permitted variant, active. */
  const guests: PublicGuestGateway = {
    async getPublicGuest(slug, tokenHash) {
      const inv = slugs[slug];
      if (inv === undefined || hex(tokenHash) !== guest.tokenHash || guest.tokenIssuedAt === null || guest.projectId !== inv.projectId) return null;
      const variant = guest.invitationVariant ?? (packageCode === "COMMON" ? "COMMON" : null);
      if (variant !== inv.variant || guest.revoked) return null;
      return { displayName: guest.displayName };
    },
  };
  return { guest, staff, guests, replaceCalls, addons };
}

const authGateway: StaffAuthGateway<{ marker: string }> = {
  createClient: () => ({ marker: "staff" }),
  getAuthenticatedUserId: async (_c, token) => (token === "good" ? "11111111-1111-4111-8111-111111111111" : null),
  getActiveStaffProfile: async () => ({ role: "STAFF", displayName: "Staff" }),
};

const issue = (db: ReturnType<typeof fakeDb>, body: unknown, auth: string | null = "Bearer good", projectId = PROJECT_A) =>
  handleIssueGuestLinkRequest(auth, projectId, GUEST_ID, async () => body, authGateway, db.staff);

function issuedPath(result: Awaited<ReturnType<typeof issue>>): { slug: string; token: string } {
  expect(result.status).toBe(200);
  const data = (result.body as { data: { invitationPath: string } }).data;
  const match = TOKEN_PATH.exec(data.invitationPath);
  expect(match).not.toBeNull();
  return { slug: match![1], token: match![2] };
}

// ---------------------------------------------------------------------------
// A–D: token generation, hash-only storage, ISSUE / REGENERATE
// ---------------------------------------------------------------------------

describe("A–D: opaque token issuance and regeneration", () => {
  it("A: tokens are 32 CSPRNG bytes, base64url (43 chars), unique; hash is SHA-256 of the raw token", () => {
    const tokens = Array.from({ length: 50 }, () => generateAccessToken());
    for (const t of tokens) {
      expect(t.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(t.rawToken, "base64url")).toHaveLength(32);
      expect(hex(t.tokenHash)).toBe(createHash("sha256").update(t.rawToken, "utf8").digest("hex"));
    }
    expect(new Set(tokens.map((t) => t.rawToken)).size).toBe(50);
  });

  it("B/C: ISSUE returns the personalized path once; only the hash + hint are written, never the raw token", async () => {
    const db = fakeDb();
    const res = await issue(db, { action: "ISSUE" });
    const { slug, token } = issuedPath(res);
    expect(slug).toBe(SLUG_A);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(Object.keys((res.body as { data: object }).data).sort()).toEqual(["guestId", "invitationPath", "invitationVariant", "projectId"]);
    expect(db.replaceCalls).toHaveLength(1);
    const written = db.replaceCalls[0];
    expect(written.expectIssued).toBe(false);
    expect(hex(written.tokenHash)).toBe(hex(hashAccessToken(token)));
    expect(JSON.stringify({ ...written, tokenHash: hex(written.tokenHash) })).not.toContain(token);
    expect(db.guest.tokenHash).toBe(hex(hashAccessToken(token)));
  });

  it("C: a second ISSUE is refused (409) and does not rotate the delivered link", async () => {
    const db = fakeDb();
    issuedPath(await issue(db, { action: "ISSUE" }));
    const before = db.guest.tokenHash;
    expect((await issue(db, { action: "ISSUE" })).status).toBe(409);
    expect(db.guest.tokenHash).toBe(before);
  });

  it("D: REGENERATE replaces the hash; the old token stops resolving immediately, the new one resolves", async () => {
    const db = fakeDb();
    const first = issuedPath(await issue(db, { action: "ISSUE" }));
    const second = issuedPath(await issue(db, { action: "REGENERATE" }));
    expect(second.token).not.toBe(first.token);
    expect(db.replaceCalls[1].expectIssued).toBe(true);
    expect(await db.guests.getPublicGuest(SLUG_A, hashAccessToken(first.token))).toBeNull();
    expect(await db.guests.getPublicGuest(SLUG_A, hashAccessToken(second.token))).toEqual({ displayName: DISPLAY_NAME });
  });

  it.each([
    ["REGENERATE before any ISSUE", {}, "COMMON", { action: "REGENERATE" }, 409],
    ["revoked guest", { revoked: true }, "COMMON", { action: "ISSUE" }, 409],
    ["NULL variant on a SEPARATE package (never guessed)", { invitationVariant: null }, "SEPARATE", { action: "ISSUE" }, 422],
    ["variant without an invitation row", { invitationVariant: "GROOM" }, "SEPARATE", { action: "ISSUE" }, 422],
    ["unknown action", {}, "COMMON", { action: "ROTATE" }, 400],
    ["extra body key (browser-supplied hash)", {}, "COMMON", { action: "ISSUE", tokenHash: "00" }, 400],
  ] as const)("%s → %i, nothing written", async (_label, overrides, pkg, body, status) => {
    const db = fakeDb(overrides as Partial<FakeGuestRow>, pkg);
    expect((await issue(db, body)).status).toBe(status);
    expect(db.replaceCalls).toHaveLength(0);
  });

  it("NULL variant on a COMMON package issues on the COMMON invitation", async () => {
    expect(issuedPath(await issue(fakeDb({ invitationVariant: null }), { action: "ISSUE" })).slug).toBe(SLUG_A);
  });

  it("auth first: no bearer → 401; guest of another Project → 404; lost race → 409", async () => {
    const db = fakeDb();
    expect((await issue(db, { action: "ISSUE" }, null)).status).toBe(401);
    expect((await issue(db, { action: "ISSUE" }, "Bearer good", PROJECT_B)).status).toBe(404);
    const racing = fakeDb();
    racing.staff.replaceGuestToken = async () => false;
    expect((await issue(racing, { action: "ISSUE" })).status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// E–L: personalized public route
// ---------------------------------------------------------------------------

async function publishedRecord(): Promise<PublicInvitationRecord> {
  const snapshot = (await buildRendererFixture({ variant: "COMMON" })).snapshot;
  return {
    variant: snapshot.variant,
    projectCode: snapshot.project.code,
    publishedVersion: {
      id: "e0000000-0000-4000-8000-0000000000b1",
      versionNumber: 1,
      templateVersionId: FIXTURE_TEMPLATE_VERSION_ID,
      rendererKey: snapshot.template.rendererKey,
      publishedAt: "2026-10-05T04:11:56.123456+00:00",
      payload: snapshot,
      media: extractSnapshotMediaRefs(snapshot).map((id) => ({ id, storageBucket: "project-media", storagePath: `p/${id}.jpg`, width: 800, height: 600 })),
    },
  };
}

async function pageDeps(guests: PublicGuestGateway) {
  const rec = await publishedRecord();
  const invitationSlugs: string[] = [];
  return {
    invitationSlugs,
    deps: {
      invitations: {
        async getPublicInvitation(slug: string) {
          invitationSlugs.push(slug);
          return slug === SLUG_A || slug === SLUG_B ? rec : null;
        },
      },
      signMedia: async (media: readonly { id: string; storagePath: string }[]) =>
        new Map(media.map((m) => [m.id, `https://signed.test/${m.storagePath}`])),
      rendererRegistry: PRODUCTION_COMPATIBILITY_REGISTRY.compatibility,
      guests,
    },
  };
}

describe("E–L: /i/[slug]/g/[token]", () => {
  it("E/K: a valid token renders the SAME published pipeline with the guest's canonical display name", async () => {
    const db = fakeDb();
    const { token } = issuedPath(await issue(db, { action: "ISSUE" }));
    const { deps } = await pageDeps(db.guests);
    const view = await loadPersonalizedPublicInvitation(SLUG_A, token, deps);
    expect(view).not.toBeNull();
    expect(view!.viewModel.guest).toEqual({ displayName: DISPLAY_NAME });
    const generic = await loadPublicInvitation(SLUG_A, deps);
    expect(view!.rendererKey).toBe(generic!.rendererKey);
    expect({ ...view!.viewModel, guest: undefined }).toEqual({ ...generic!.viewModel, guest: undefined });
    const html = renderToStaticMarkup(
      <PublicInvitationRenderer publicSlug={SLUG_A} guestToken={token} rendererKey={view!.rendererKey} viewModel={view!.viewModel} sections={view!.sections} />,
    );
    expect(html).toContain(DISPLAY_NAME);
    expect(JSON.stringify(view)).not.toContain(token);
  });

  it("J: generic /i/[slug] is unchanged — no guest overlay", async () => {
    const { deps } = await pageDeps(fakeDb().guests);
    const generic = await loadPublicInvitation(SLUG_A, deps);
    expect(generic!.viewModel.guest).toBeUndefined();
  });

  it.each(["", "short", "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)}/`, "../../etc/passwd"])(
    "F: malformed token %j → null with no database call",
    async (bad) => {
      const db = fakeDb();
      const spy = vi.fn(db.guests.getPublicGuest);
      const { deps, invitationSlugs } = await pageDeps({ getPublicGuest: spy });
      expect(await loadPersonalizedPublicInvitation(SLUG_A, bad, deps)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
      expect(invitationSlugs).toEqual([]);
    },
  );

  it("G/H/I: unknown, regenerated-old and other-Project tokens → null and the generic invitation is never loaded", async () => {
    const db = fakeDb();
    const old = issuedPath(await issue(db, { action: "ISSUE" })).token;
    const { token } = issuedPath(await issue(db, { action: "REGENERATE" }));
    const { deps, invitationSlugs } = await pageDeps(db.guests);
    expect(await loadPersonalizedPublicInvitation(SLUG_A, generateAccessToken().rawToken, deps)).toBeNull();
    expect(await loadPersonalizedPublicInvitation(SLUG_A, old, deps)).toBeNull();
    expect(await loadPersonalizedPublicInvitation(SLUG_B, token, deps)).toBeNull();
    expect(invitationSlugs).toEqual([]);
    expect(await loadPersonalizedPublicInvitation(SLUG_A, token, deps)).not.toBeNull();
  });

  it("I: the page fails closed with notFound() and never imports the generic loader/page", () => {
    const page = strip(read("app/i/[slug]/g/[token]/page.tsx"));
    expect(page).toMatch(/if \(view === null\) \{\s*notFound\(\);/);
    expect(page).not.toMatch(/load-public-invitation|from "\.\.\/\.\.\/page"|redirect\(/);
    expect(page).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("L: personalized metadata is fixed: generic title, noindex, no-referrer, no Open Graph / guest name / token / og:url", () => {
    const meta = personalizedPage.metadata;
    expect(meta).toEqual({ title: "Thiệp cưới — WeddingClick", robots: { index: false, follow: false }, referrer: "no-referrer" });
    expect("generateMetadata" in personalizedPage).toBe(false);
    const page = strip(read("app/i/[slug]/g/[token]/page.tsx"));
    expect(page).not.toMatch(/openGraph|public-social-share|alternates|canonical|og:url/);
  });

  it("toPublicGuest accepts only { displayName } or null", () => {
    expect(toPublicGuest(null)).toBeNull();
    expect(toPublicGuest({ displayName: "Em và sự cô đơn" })).toEqual({ displayName: "Em và sự cô đơn" });
    for (const bad of [{}, { displayName: "" }, { displayName: "x", guestId: GUEST_ID }, { displayName: "x".repeat(201) }, "x", []]) {
      expect(() => toPublicGuest(bad)).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// M–R: RSVP
// ---------------------------------------------------------------------------

function rsvpDeps(guestOutcome: string | null | Error = "f0000000-0000-4000-8000-0000000000a1") {
  const generic: { slug: string; input: RsvpSubmitInputV1 }[] = [];
  const personalized: { slug: string; hash: string; input: RsvpSubmitInputV1 }[] = [];
  const rsvps: PublicRsvpGateway = {
    async submitPublicRsvp(slug, input) {
      generic.push({ slug, input });
      return "f0000000-0000-4000-8000-0000000000a2";
    },
  };
  const guestRsvps: PublicGuestRsvpGateway = {
    async submitPublicGuestRsvp(slug, hash, input) {
      personalized.push({ slug, hash: hex(hash), input });
      if (guestOutcome instanceof Error) throw guestOutcome;
      return guestOutcome;
    },
  };
  return { generic, personalized, deps: { rsvps, guestRsvps } };
}

const TOKEN = generateAccessToken().rawToken;
const rsvpBody = (o: Record<string, unknown> = {}) => ({
  publicSlug: SLUG_A,
  attendance: "ATTENDING",
  partySize: 2,
  message: null,
  guestName: "Anh Hiếu và gia đình",
  ...o,
});
const submit = (body: unknown, deps: ReturnType<typeof rsvpDeps>["deps"]) => handleSubmitPublicRsvpRequest(async () => body, deps);

describe("M–R: generic and personalized RSVP", () => {
  it("M: the generic five-key body still goes only to the generic (guest_id NULL) RPC", async () => {
    const r = rsvpDeps();
    expect((await submit(rsvpBody(), r.deps)).status).toBe(201);
    expect(r.generic).toHaveLength(1);
    expect(r.personalized).toHaveLength(0);
  });

  it("N/O: with guestToken only the token HASH selects the guest; the typed name is forwarded as response data", async () => {
    const r = rsvpDeps();
    const res = await submit(rsvpBody({ guestToken: TOKEN, guestName: "Một cái tên khác hẳn" }), r.deps);
    expect(res.status).toBe(201);
    expect(r.generic).toHaveLength(0);
    expect(r.personalized).toEqual([
      { slug: SLUG_A, hash: hex(hashAccessToken(TOKEN)), input: { attendance: "ATTENDING", partySize: 2, message: null, guestName: "Một cái tên khác hẳn" } },
    ]);
  });

  it("O: guestId / token / guest keys are still rejected; a browser cannot pick the guest", async () => {
    const r = rsvpDeps();
    for (const key of ["guestId", "token", "guest"]) {
      expect((await submit(rsvpBody({ guestToken: TOKEN, [key]: GUEST_ID }), r.deps)).status).toBe(400);
    }
    expect(r.personalized).toHaveLength(0);
    expect(r.generic).toHaveLength(0);
  });

  it("P/Q/R: repeat submissions with one token reach the same guest RPC (upsert), attendance may change", async () => {
    const r = rsvpDeps();
    expect((await submit(rsvpBody({ guestToken: TOKEN }), r.deps)).status).toBe(201);
    expect((await submit(rsvpBody({ guestToken: TOKEN, attendance: "NOT_ATTENDING", partySize: 0 }), r.deps)).status).toBe(201);
    expect((await submit(rsvpBody({ guestToken: TOKEN, attendance: "MAYBE", partySize: 1 }), r.deps)).status).toBe(201);
    expect(new Set(r.personalized.map((c) => c.hash)).size).toBe(1);
    expect(r.personalized.map((c) => c.input.attendance)).toEqual(["ATTENDING", "NOT_ATTENDING", "MAYBE"]);
  });

  it.each([
    ["malformed token (no DB call, never a generic insert)", { guestToken: "nope" }, null, 404, 0],
    ["unresolved token / other Project (RPC NULL)", { guestToken: TOKEN }, null, 404, 1],
    ["revoked guest (GT001)", { guestToken: TOKEN }, new ApiError("REVOKED_TOKEN", "Invitation link is no longer valid"), 410, 1],
    ["generic DB failure", { guestToken: TOKEN }, new Error("duplicate key value violates rsvps_guest_id_key"), 500, 1],
  ] as const)("%s → %i", async (_label, extra, outcome, status, calls) => {
    const r = rsvpDeps(outcome as string | null | Error);
    const res = await submit(rsvpBody(extra), r.deps);
    expect(res.status).toBe(status);
    expect(r.personalized).toHaveLength(calls);
    expect(r.generic).toHaveLength(0);
    expect(JSON.stringify(res.body)).not.toMatch(/rsvps_guest_id_key|nope/);
  });

  it("client capability: generic posts no guestToken; personalized posts it; 410 → UNAVAILABLE", async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = (status: number) =>
      (async (_url: string, init: RequestInit) => {
        calls.push(init);
        return new Response(JSON.stringify(status === 201 ? { data: { recorded: true } } : { error: "x" }), { status });
      }) as unknown as typeof fetch;
    const input = { attendance: "MAYBE", partySize: 1, message: null, guestName: "Team Marketing" } as const;
    expect(await createPublicRsvpCapability(SLUG_A, fetchImpl(201)).submit(input)).toEqual({ status: "SUCCESS" });
    expect(await createPublicRsvpCapability(SLUG_A, fetchImpl(201), TOKEN).submit(input)).toEqual({ status: "SUCCESS" });
    expect(await createPublicRsvpCapability(SLUG_A, fetchImpl(410), TOKEN).submit(input)).toEqual({ status: "UNAVAILABLE" });
    expect(JSON.parse(String(calls[0].body))).toStrictEqual({ publicSlug: SLUG_A, ...input });
    expect(JSON.parse(String(calls[1].body))).toStrictEqual({ publicSlug: SLUG_A, guestToken: TOKEN, ...input });
  });
});

// ---------------------------------------------------------------------------
// Migration 0042 contract
// ---------------------------------------------------------------------------

const MIGRATIONS = "supabase/migrations";
const sqlFile = readdirSync(join(ROOT, MIGRATIONS)).filter((f) => f.includes("_0042_"));
const sql = read(`${MIGRATIONS}/${sqlFile[0]}`);
const executable = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("migration 0042", () => {
  it("is the only 0042 and the latest migration; three SECURITY DEFINER functions with empty search_path", () => {
    // Task 035B: the only migration allowed after 0042 is the owner-approved legacy V1 lockdown.
    expect(readdirSync(join(ROOT, MIGRATIONS)).filter((f) => f.includes("_0043_"))).toEqual(["20260911041203_0043_legacy_v1_lockdown.sql"]);
    expect(sqlFile).toHaveLength(1);
    // Launch Hardening 04 (owner-approved checkpoint maintenance): exactly the approved 0044 may follow 0043.
    expect(readdirSync(join(ROOT, MIGRATIONS)).sort().slice(-3)).toEqual([sqlFile[0], "20260911041203_0043_legacy_v1_lockdown.sql", "20260911041204_0044_republish_after_published.sql"]);
    expect(executable.match(/CREATE FUNCTION/g)).toHaveLength(3);
    expect(executable.match(/SECURITY DEFINER\s+SET search_path = ''/g)).toHaveLength(3);
  });

  it("grants EXECUTE to service_role only on the two public functions; the helper has no grant; no table/policy/index change", () => {
    expect(executable.match(/\bGRANT\b[^;]*;/g)).toEqual([
      "GRANT EXECUTE ON FUNCTION public.get_public_guest_invitation(text, bytea) TO service_role;",
      "GRANT EXECUTE ON FUNCTION public.submit_public_guest_rsvp(text, bytea, text, integer, text, text) TO service_role;",
    ]);
    for (const fn of ["resolve_public_guest(text, bytea)", "get_public_guest_invitation(text, bytea)", "submit_public_guest_rsvp(text, bytea, text, integer, text, text)"]) {
      for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
        expect(executable).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM ${role};`);
      }
    }
    expect(executable.match(/ALTER TABLE[^;]*;/g)).toEqual(["ALTER TABLE public.guests\n  ADD COLUMN token_issued_at TIMESTAMPTZ NULL;"]);
    expect(executable).not.toMatch(/CREATE POLICY|CREATE (UNIQUE )?INDEX|DROP |USING \(true\)|log_activity|\b(v_guest|g)\.token_hint|RAISE[^;]*%/i);
  });

  it("H: resolution requires the current PUBLISHED slug, the hash, the same Project and the §7.3 variant", () => {
    expect(executable).toMatch(/pi\.public_slug = p_public_slug/);
    expect(executable).toMatch(/version_type IS DISTINCT FROM 'PUBLISHED'/);
    expect(executable).toMatch(/octet_length\(p_token_hash\) <> 32/);
    expect(executable).toMatch(/g\.token_hash = p_token_hash/);
    expect(executable).toMatch(/v_guest\.project_id IS DISTINCT FROM v_project_id THEN\s+RETURN;/);
    expect(executable).toMatch(/v_guest\.invitation_variant IS DISTINCT FROM v_variant THEN\s+RETURN;/);
    expect(executable).toMatch(/v_package_code IS DISTINCT FROM 'COMMON' OR v_variant IS DISTINCT FROM 'COMMON'/);
    expect(executable).toMatch(/IF NOT FOUND OR v_is_revoked THEN\s+RETURN NULL;/);
    expect(executable).toMatch(/jsonb_build_object\('displayName', v_display_name\)/);
  });

  it("N/P/R: the RSVP upserts on rsvps_guest_id_key with guest_id from the token; generic 0040 untouched", () => {
    expect(executable).toMatch(/VALUES \(\s+v_project_id,\s+v_guest_id,\s+p_guest_name,/);
    expect(executable).toMatch(/ON CONFLICT \(guest_id\) WHERE guest_id IS NOT NULL\s+DO UPDATE SET/);
    const updateSet = executable.slice(executable.indexOf("DO UPDATE SET"), executable.indexOf("RETURNING r.id"));
    expect(updateSet).not.toMatch(/project_id|guest_id\s*=|created_at|\bid\s*=/);
    expect(executable).toMatch(/ERRCODE = 'GT001'/);
    expect(executable).not.toMatch(/submit_public_rsvp\b|DELETE FROM/);
  });
});

// ---------------------------------------------------------------------------
// S–V: preview/review protection, service_role containment, no token leakage
// ---------------------------------------------------------------------------

function listSources(dir: string): string[] {
  const absolute = join(ROOT, dir);
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absolute)) {
    if (entry === "node_modules" || entry === "__tests__" || entry === ".next") continue;
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) out.push(...listSources(relative(ROOT, path)));
    else if (/\.tsx?$/.test(entry)) out.push(relative(ROOT, path));
  }
  return out;
}
const PRODUCTION = ["app", "lib", "components", "templates"].flatMap(listSources);
const importersOf = (name: string) => PRODUCTION.filter((f) => new RegExp(`from\\s+["'][^"']*/${name}["']`).test(read(f)));

const NEW_FILES = [
  "app/i/[slug]/g/[token]/page.tsx",
  "app/api/v2/internal/projects/[id]/guests/[guestId]/access-link/route.ts",
  "lib/server/guest-links/issue-guest-link.ts",
  "lib/server/guest-links/guest-link-types.ts",
  "lib/server/guest-links/guest-link-path.ts",
  "lib/server/routes/guest-links.ts",
  "lib/server/supabase/guest-link-staff-repository.ts",
  "lib/server/public-guest/load-personalized-public-invitation.ts",
  "lib/server/public-guest/public-guest-supabase.ts",
  "lib/server/public-guest/public-guest-types.ts",
  "lib/server/supabase/public-guest-repository.ts",
];

describe("S–V: containment and privacy", () => {
  it("S/T: Staff Preview and Customer Review stay UNAVAILABLE-only, with no guest token or public RSVP endpoint", () => {
    for (const f of ["app/admin/preview-frame/staff-preview-renderer.tsx", "app/review/[token]/frame/page.tsx", "app/review/[token]/page.tsx"]) {
      expect(read(f), f).not.toMatch(/guestToken|\/api\/v2\/public\/rsvp|createPublicRsvpCapability|PublicInvitationRenderer|public-guest/);
    }
    expect(read("app/admin/preview-frame/staff-preview-renderer.tsx")).toMatch(/submit: async \(\): Promise<RsvpSubmitResultV1> => STAFF_PREVIEW_RSVP_UNAVAILABLE_RESULT/);
  });

  it("U: only the public-guest repository touches service_role; it is imported only by the two server wirings; staff issuance never uses service_role", () => {
    expect(importersOf("public-guest-repository").sort()).toEqual(
      ["lib/server/public-guest/public-guest-supabase.ts", "lib/server/public-rsvp/public-rsvp-supabase.ts"].sort(),
    );
    expect(importersOf("public-guest-supabase")).toEqual(["app/i/[slug]/g/[token]/page.tsx"]);
    const repo = strip(read("lib/server/supabase/public-guest-repository.ts"));
    expect([...repo.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1])).toEqual(["get_public_guest_invitation", "submit_public_guest_rsvp"]);
    expect(repo).not.toMatch(/\.from\(|\.storage\b|console\./);
    for (const f of NEW_FILES.filter((f) => f !== "lib/server/supabase/public-guest-repository.ts").concat(["app/i/[slug]/public-invitation-renderer.tsx"])) {
      expect(read(f), f).not.toMatch(/service-role-client|SUPABASE_SERVICE_ROLE_KEY|createServiceRole/);
    }
    expect(read("app/i/[slug]/public-invitation-renderer.tsx")).not.toMatch(/public-guest|lib\/server/);
  });

  it("V: no token/hash is logged, selected back or put into browser state beyond the route's own token", () => {
    for (const f of NEW_FILES) {
      for (const line of read(f).split("\n").filter((l) => /console\./.test(l))) {
        expect(line, f).toMatch(/console\.error\("\[[A-Za-z]+\] [A-Za-z ]+"\);/);
      }
    }
    const staffRepo = strip(read("lib/server/supabase/guest-link-staff-repository.ts"));
    for (const select of staffRepo.match(/\.select\("[^"]*"\)/g) ?? []) expect(select).not.toMatch(/token_hash/);
    expect(strip(read("lib/server/public-guest/load-personalized-public-invitation.ts"))).toMatch(
      /loadPublicInvitation\(publicSlug, deps, \{ displayName: guest\.displayName \}\)/,
    );
    expect(strip(read("app/i/[slug]/public-invitation-renderer.tsx"))).not.toMatch(/localStorage|sessionStorage|document\.cookie|tokenHash/);
  });
});

// ---------------------------------------------------------------------------
// Owner correction: token_issued_at is the issuance authority (not token_hint)
// ---------------------------------------------------------------------------

describe("033B1 correction: token_issued_at", () => {
  const DORMANT = generateAccessToken();
  const dormantDb = (o: Partial<FakeGuestRow> = {}) =>
    fakeDb({ tokenHash: hex(DORMANT.tokenHash), tokenHint: DORMANT.tokenHint, tokenIssuedAt: null, ...o });

  it("A: a pre-existing hash with token_issued_at NULL never resolves (even with a hint present)", async () => {
    const db = dormantDb();
    expect(await db.guests.getPublicGuest(SLUG_A, DORMANT.tokenHash)).toBeNull();
    const { deps, invitationSlugs } = await pageDeps(db.guests);
    expect(await loadPersonalizedPublicInvitation(SLUG_A, DORMANT.rawToken, deps)).toBeNull();
    expect(invitationSlugs).toEqual([]);
  });

  it("B/C: ISSUE on a dormant guest (hint set, issued_at NULL) stores a fresh hash + hint and sets token_issued_at", async () => {
    const db = dormantDb();
    const { token } = issuedPath(await issue(db, { action: "ISSUE" }));
    expect(db.replaceCalls[0].expectIssued).toBe(false);
    expect(db.guest.tokenHash).toBe(hex(hashAccessToken(token)));
    expect(db.guest.tokenHash).not.toBe(hex(DORMANT.tokenHash));
    expect(db.guest.tokenHint).toBe(token.slice(-8));
    expect(db.guest.tokenIssuedAt).not.toBeNull();
    expect(await db.guests.getPublicGuest(SLUG_A, DORMANT.tokenHash)).toBeNull();
  });

  it("D: a second ISSUE once token_issued_at is set → 409, nothing rotated", async () => {
    const db = dormantDb();
    issuedPath(await issue(db, { action: "ISSUE" }));
    const before = db.guest.tokenHash;
    expect((await issue(db, { action: "ISSUE" })).status).toBe(409);
    expect(db.guest.tokenHash).toBe(before);
  });

  it("E: REGENERATE requires token_issued_at NOT NULL (dormant guest with a hint → 409, nothing written)", async () => {
    const db = dormantDb();
    expect((await issue(db, { action: "REGENERATE" })).status).toBe(409);
    expect(db.replaceCalls).toHaveLength(0);
  });

  it("F/G: REGENERATE replaces the hash and re-stamps token_issued_at; old token stops, new token resolves", async () => {
    const db = dormantDb();
    const first = issuedPath(await issue(db, { action: "ISSUE" }));
    db.guest.tokenIssuedAt = "2026-01-01T00:00:00.000Z";
    const second = issuedPath(await issue(db, { action: "REGENERATE" }));
    expect(db.guest.tokenIssuedAt).not.toBe("2026-01-01T00:00:00.000Z");
    expect(await db.guests.getPublicGuest(SLUG_A, hashAccessToken(first.token))).toBeNull();
    expect(await db.guests.getPublicGuest(SLUG_A, hashAccessToken(second.token))).toEqual({ displayName: DISPLAY_NAME });
  });

  it("H: a revoked guest stays blocked for ISSUE, REGENERATE and resolution", async () => {
    const db = dormantDb();
    const { token } = issuedPath(await issue(db, { action: "ISSUE" }));
    db.guest.revoked = true;
    expect((await issue(db, { action: "REGENERATE" })).status).toBe(409);
    expect(await db.guests.getPublicGuest(SLUG_A, hashAccessToken(token))).toBeNull();
    expect((await issue(dormantDb({ revoked: true }), { action: "ISSUE" })).status).toBe(409);
  });

  it("I: 0042 adds token_issued_at with no default/backfill and both public RPCs resolve only issued tokens", () => {
    expect(executable).toMatch(/ADD COLUMN token_issued_at TIMESTAMPTZ NULL;/);
    expect(executable).not.toMatch(/token_issued_at TIMESTAMPTZ[^;]*DEFAULT|UPDATE public\.guests/);
    expect(executable).toMatch(/IF NOT FOUND OR v_guest\.token_issued_at IS NULL THEN\s+RETURN;/);
    expect(executable.match(/FROM public\.resolve_public_guest\(p_public_slug, p_token_hash\)/g)).toHaveLength(2);
    const staffRepo = strip(read("lib/server/supabase/guest-link-staff-repository.ts"));
    expect(staffRepo).toMatch(/hasIssuedLink: guest\.token_issued_at !== null/);
    expect(staffRepo).not.toMatch(/\.(is|not)\("token_hint"/);
    expect(staffRepo).toMatch(/token_issued_at: new Date\(\)\.toISOString\(\)/);
  });

  it("I: an unresolved (e.g. dormant) personalized token → 404, never a generic insert", async () => {
    const r = rsvpDeps(null);
    expect((await submit(rsvpBody({ guestToken: DORMANT.rawToken }), r.deps)).status).toBe(404);
    expect(r.personalized).toEqual([expect.objectContaining({ hash: hex(DORMANT.tokenHash) })]);
    expect(r.generic).toHaveLength(0);
  });

  it("J: generic RSVP is unaffected — five keys go only to the guest_id NULL path", async () => {
    const r = rsvpDeps();
    expect((await submit(rsvpBody(), r.deps)).status).toBe(201);
    expect(r.generic).toHaveLength(1);
    expect(r.personalized).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Final alignment: actor-neutral use case + PERSONALIZED_GUEST entitlement gate
// ---------------------------------------------------------------------------

describe("033B1 alignment: entitlement + shared use case", () => {
  const NO_ADDON: FakeAddonRow[] = [];
  const REVOKED_ADDON: FakeAddonRow[] = [{ projectId: PROJECT_A, addonCode: "PERSONALIZED_GUEST", revoked: true }];
  const OTHER_PROJECT_ADDON: FakeAddonRow[] = [{ projectId: PROJECT_B, addonCode: "PERSONALIZED_GUEST", revoked: false }];

  it("A/I: entitled Project + staff → ISSUE succeeds (fresh hash, token_issued_at set)", async () => {
    const db = fakeDb();
    const { token } = issuedPath(await issue(db, { action: "ISSUE" }));
    expect(db.guest.tokenHash).toBe(hex(hashAccessToken(token)));
    expect(db.guest.tokenIssuedAt).not.toBeNull();
  });

  it("B/J: entitled Project + staff → REGENERATE succeeds; the old token stops resolving", async () => {
    const db = fakeDb();
    const first = issuedPath(await issue(db, { action: "ISSUE" }));
    const second = issuedPath(await issue(db, { action: "REGENERATE" }));
    expect(await db.guests.getPublicGuest(SLUG_A, hashAccessToken(first.token))).toBeNull();
    expect(await db.guests.getPublicGuest(SLUG_A, hashAccessToken(second.token))).toEqual({ displayName: DISPLAY_NAME });
  });

  it.each([
    ["no add-on row", NO_ADDON],
    ["E: revoked add-on row", REVOKED_ADDON],
    ["add-on only on another Project", OTHER_PROJECT_ADDON],
  ])("C: ISSUE without active entitlement (%s) → 403, nothing written", async (_label, addons) => {
    const db = fakeDb({}, "COMMON", addons);
    const res = await issue(db, { action: "ISSUE" });
    expect(res.status).toBe(403);
    expect(db.replaceCalls).toHaveLength(0);
  });

  it("D/E: REGENERATE after the add-on is revoked → 403; the already-issued link keeps resolving (deferred decision)", async () => {
    const db = fakeDb();
    const { token } = issuedPath(await issue(db, { action: "ISSUE" }));
    db.addons[0].revoked = true;
    const before = db.guest.tokenHash;
    expect((await issue(db, { action: "REGENERATE" })).status).toBe(403);
    expect(db.guest.tokenHash).toBe(before);
    expect(await db.guests.getPublicGuest(SLUG_A, hashAccessToken(token))).toEqual({ displayName: DISPLAY_NAME });
  });

  it("F: a browser-supplied entitlement override is rejected (400) and never consulted", async () => {
    const db = fakeDb({}, "COMMON", NO_ADDON);
    for (const body of [{ action: "ISSUE", entitled: true }, { action: "ISSUE", personalizedGuest: true }]) {
      expect((await issue(db, body)).status).toBe(400);
    }
    expect(db.replaceCalls).toHaveLength(0);
  });

  it("G: the staff support path still requires requireStaff (no bearer → 401, non-staff → 401/403)", async () => {
    const db = fakeDb();
    expect((await issue(db, { action: "ISSUE" }, null)).status).toBe(401);
    expect((await issue(db, { action: "ISSUE" }, "Bearer someone-else")).status).toBe(401);
    expect(db.replaceCalls).toHaveLength(0);
  });

  it("H: issueGuestLink is actor-neutral — called with a plain client + gateway, no StaffContext", async () => {
    const { issueGuestLink } = await import("../../guest-links/issue-guest-link");
    const db = fakeDb();
    const issued = await issueGuestLink(PROJECT_A, GUEST_ID, { action: "ISSUE" }, { marker: "any-authorized-client" }, db.staff);
    expect(issued.invitationPath).toMatch(TOKEN_PATH);
    const src = strip(read("lib/server/guest-links/issue-guest-link.ts"));
    expect(src).not.toMatch(/StaffContext|staff-context|requireStaff|staff\./);
    expect(strip(read("lib/server/routes/guest-links.ts"))).toMatch(/requireStaff\(token, authGateway\)[\s\S]*issueGuestLink\(projectId, guestId, body, staff\.supabase, guestLinkGateway\)/);
  });

  it("entitlement is read server-side from project_addons by the immutable PERSONALIZED_GUEST code, non-revoked only", () => {
    const repo = strip(read("lib/server/supabase/guest-link-staff-repository.ts"));
    expect(repo).toMatch(/\.from\("project_addons"\)[\s\S]*\.eq\("project_id", projectId\)[\s\S]*\.eq\("addon_code_snapshot", PERSONALIZED_GUEST_ADDON_CODE\)[\s\S]*\.is\("revoked_at", null\)/);
    expect(repo).not.toMatch(/service-role-client|createServiceRole/);
  });

  it("K/L/M: generic route, 0042 resolution and the RSVP use case are untouched by this patch", () => {
    for (const f of [
      "app/i/[slug]/page.tsx",
      "app/i/[slug]/g/[token]/page.tsx",
      "lib/server/public-rsvp/submit-public-rsvp.ts",
      "lib/server/public-guest/load-personalized-public-invitation.ts",
    ]) {
      expect(read(f), f).not.toMatch(/hasPersonalizedGuestEntitlement|project_addons|PERSONALIZED_GUEST/);
    }
    expect(executable).not.toMatch(/project_addons|PERSONALIZED_GUEST/);
  });

  it("M: a personalized RSVP still binds only through the token hash", async () => {
    const r = rsvpDeps();
    expect((await submit(rsvpBody({ guestToken: TOKEN }), r.deps)).status).toBe(201);
    expect(r.personalized).toEqual([expect.objectContaining({ hash: hex(hashAccessToken(TOKEN)) })]);
    expect(r.generic).toHaveLength(0);
  });
});
