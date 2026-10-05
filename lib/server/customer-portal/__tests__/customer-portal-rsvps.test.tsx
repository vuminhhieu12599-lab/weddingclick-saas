import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortalRsvpList } from "../../../../app/portal/[token]/portal-rsvp-list";
import { buildRendererFixture } from "../../../../templates/core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_TEMPLATE_VERSION_ID } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import { generateAccessToken, hashAccessToken } from "../../auth/access-token-crypto";
import type { AccessLinkResolutionRepository, ResolvedAccessLinkRow } from "../../supabase/access-link-resolution-repository";
import { toPortalRsvps } from "../../supabase/customer-portal-repository";
import type { CustomerPortalGateway, CustomerPortalView, PortalProjectRecord } from "../customer-portal-types";
import { loadCustomerPortal } from "../load-customer-portal";

/**
 * Task 033D — Portal RSVP owner-read: scoped only by the server-resolved
 * PORTAL projectId, generic + personalized rows, canonical guest identity,
 * newest first, read-only, no Guest Tool.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

const PROJECT_A = "a0000000-0000-4000-8000-00000000000a";
const PROJECT_B = "b0000000-0000-4000-8000-00000000000b";
const GUEST_A = "f0000000-0000-4000-8000-0000000000f1";
const GUEST_B = "f0000000-0000-4000-8000-0000000000f2";
const INV = "d0000000-0000-4000-8000-0000000000d1";
const VER = "e0000000-0000-4000-8000-0000000000e1";

const PORTAL_A = generateAccessToken();
const PORTAL_B = generateAccessToken();

/** Raw DB-shaped rows, as the repository SELECT returns them. */
const dbRow = (projectId: string, patch: Record<string, unknown> = {}) => ({
  project_id: projectId,
  guest_id: null,
  guest_display_name_snapshot: "Bạn Lan",
  attendance: "ATTENDING",
  party_size: 2,
  message: null,
  created_at: "2026-10-01T03:00:00Z",
  updated_at: "2026-10-01T03:00:00Z",
  guest: null,
  ...patch,
});

const DB: Record<string, unknown[]> = {
  [PROJECT_A]: [
    dbRow(PROJECT_A, { guest_display_name_snapshot: "Bạn Lan", updated_at: "2026-10-01T03:00:00Z", message: "Chúc mừng hai bạn!" }),
    dbRow(PROJECT_A, {
      guest_id: GUEST_A,
      guest_display_name_snapshot: "Hiếu nè",
      attendance: "MAYBE",
      party_size: 3,
      updated_at: "2026-10-03T10:30:00Z",
      guest: { project_id: PROJECT_A, display_name: "Anh Hiếu và gia đình", invitation_variant: "GROOM" },
    }),
    dbRow(PROJECT_A, { guest_display_name_snapshot: "Bạn Lan", attendance: "NOT_ATTENDING", party_size: 0, updated_at: "2026-10-02T01:00:00Z" }),
  ],
  [PROJECT_B]: [
    dbRow(PROJECT_B, {
      guest_id: GUEST_B,
      guest_display_name_snapshot: "B secret",
      guest: { project_id: PROJECT_B, display_name: "Khách của dự án B", invitation_variant: "BRIDE" },
    }),
  ],
};

function resolution(rows: { token: ReturnType<typeof generateAccessToken>; row: Partial<ResolvedAccessLinkRow> }[]): AccessLinkResolutionRepository {
  return {
    async lookupByTokenHash(hash) {
      const hit = rows.find((r) => hex(r.token.tokenHash) === hex(hash));
      return hit === undefined ? null : { id: GUEST_A, projectId: PROJECT_A, linkType: "PORTAL", expiresAt: null, revokedAt: null, ...hit.row };
    },
    async touchLastUsedAt() {},
  };
}

async function publishedRecord(projectId: string): Promise<PortalProjectRecord> {
  const snapshot = (await buildRendererFixture({ variant: "COMMON" })).snapshot;
  return {
    projectCode: snapshot.project.code,
    invitations: [{ id: INV, variant: "COMMON", publicSlug: "wc-common", publishedVersionId: VER }],
    versions: [
      { id: VER, invitationId: INV, projectId, versionType: "PUBLISHED", templateVersionId: FIXTURE_TEMPLATE_VERSION_ID, rendererKey: snapshot.template.rendererKey, payload: snapshot },
    ],
    personalizedGuestEntitled: false,
  };
}

/** Fake gateway backed by the DB map through the real repository row guard. */
function deps(opts: { failRsvps?: boolean; empty?: boolean } = {}) {
  const rsvpReads: string[] = [];
  const portal: CustomerPortalGateway = {
    getPortalProject: (projectId) => publishedRecord(projectId),
    async listPortalRsvps(projectId) {
      rsvpReads.push(projectId);
      if (opts.failRsvps) throw new Error("Failed to load customer portal");
      return toPortalRsvps(opts.empty ? [] : (DB[projectId] ?? []), projectId);
    },
  };
  const links = resolution([
    { token: PORTAL_A, row: {} },
    { token: PORTAL_B, row: { projectId: PROJECT_B } },
  ]);
  return { rsvpReads, deps: { resolution: links, portal } };
}

async function ready(token: string, d = deps()) {
  const view = await loadCustomerPortal(token, d.deps);
  if (view.status !== "READY") throw new Error("expected READY");
  return view;
}

const render = (view: Extract<CustomerPortalView, { status: "READY" }>) => renderToStaticMarkup(<PortalRsvpList rows={view.rsvps} summary={view.rsvpSummary} />);

describe("033D A–E, N–P: generic + personalized RSVP owner-read", () => {
  it("A/B/P: a valid Portal reads its generic and personalized rows, newest updated first", async () => {
    const view = await ready(PORTAL_A.rawToken);
    expect(view.rsvps.map((r) => [r.kind, r.attendance])).toEqual([
      ["PERSONALIZED", "MAYBE"],
      ["GENERIC", "NOT_ATTENDING"],
      ["GENERIC", "ATTENDING"],
    ]);
    expect(view.rsvps.map((r) => r.respondedAt)).toEqual(["03/10/2026 17:30", "02/10/2026 08:00", "01/10/2026 10:00"]);
  });

  it("C/D: personalized identity is the canonical guest display_name; the typed name is only a secondary snapshot", async () => {
    const [personal] = (await ready(PORTAL_A.rawToken)).rsvps;
    expect(personal).toMatchObject({ guestName: "Anh Hiếu và gia đình", respondedAs: "Hiếu nè", invitationVariant: "GROOM" });
    const same = toPortalRsvps([dbRow(PROJECT_A, { guest_id: GUEST_A, guest_display_name_snapshot: null, guest: { project_id: PROJECT_A, display_name: "Em và sự cô đơn", invitation_variant: null } })], PROJECT_A);
    expect(same[0]).toMatchObject({ typedName: null, guest: { displayName: "Em và sự cô đơn", invitationVariant: null } });
  });

  it("E: generic rows use the typed snapshot and are never deduplicated by name", async () => {
    const generic = (await ready(PORTAL_A.rawToken)).rsvps.filter((r) => r.kind === "GENERIC");
    expect(generic.map((r) => [r.guestName, r.respondedAs, r.invitationVariant])).toEqual([
      ["Bạn Lan", null, null],
      ["Bạn Lan", null, null],
    ]);
  });

  it("N/O: Vietnamese attendance labels, stored party_size, message and summary counts render; no controls or ids", async () => {
    const view = await ready(PORTAL_A.rawToken);
    expect(view.rsvpSummary).toEqual({ responses: { ATTENDING: 1, MAYBE: 1, NOT_ATTENDING: 1 }, people: { ATTENDING: 2, MAYBE: 3, NOT_ATTENDING: 0 } });
    const html = render(view);
    for (const text of ["Phản hồi tham dự", "Sẽ tham dự · 2 người", "Có thể tham dự · 3 người", "Không tham dự", "Chúc mừng hai bạn!", "Khách mời cá nhân · thiệp nhà trai", "Phản hồi từ link chung", "Trả lời với tên: Hiếu nè"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toMatch(/Không tham dự · 0/);
    expect(html).not.toMatch(/<button|<form|<input|onClick|href=/);
    expect(html).not.toContain(GUEST_A);
  });

  it("M: no RSVP rows → friendly empty state, not an error", async () => {
    const html = render(await ready(PORTAL_A.rawToken, deps({ empty: true })));
    expect(html).toContain("Chưa có phản hồi tham dự.");
  });

  it("Q: an RSVP read failure after valid resolution throws — never a fake empty list", async () => {
    await expect(loadCustomerPortal(PORTAL_A.rawToken, deps({ failRsvps: true }).deps)).rejects.toThrow();
  });
});

describe("033D F–J, R: scoping and serialization", () => {
  it("F/G: Project A and Project B Portals each read only their own resolved projectId", async () => {
    const a = deps();
    const viewA = await ready(PORTAL_A.rawToken, a);
    expect(a.rsvpReads).toEqual([PROJECT_A]);
    expect(JSON.stringify(viewA)).not.toMatch(/dự án B|B secret/);
    const b = deps();
    const viewB = await ready(PORTAL_B.rawToken, b);
    expect(b.rsvpReads).toEqual([PROJECT_B]);
    expect(viewB.rsvps.map((r) => r.guestName)).toEqual(["Khách của dự án B"]);
    // The only input is the raw token: no projectId parameter exists to override.
    expect(loadCustomerPortal.length).toBe(2);
  });

  it("F/G: the row guard fails closed on another Project's row or a Project B guest embedded in Project A", () => {
    expect(() => toPortalRsvps(DB[PROJECT_B], PROJECT_A)).toThrow();
    expect(() => toPortalRsvps([dbRow(PROJECT_A, { guest_id: GUEST_B, guest: { project_id: PROJECT_B, display_name: "x", invitation_variant: null } })], PROJECT_A)).toThrow();
    expect(() => toPortalRsvps([dbRow(PROJECT_A, { guest_id: GUEST_A, guest: null })], PROJECT_A)).toThrow();
    expect(() => toPortalRsvps([dbRow(PROJECT_A, { attendance: "YES" })], PROJECT_A)).toThrow();
  });

  it("H/I/J: REVIEW / INTAKE tokens, guest tokens, public slugs and Project UUIDs never read RSVPs", async () => {
    const review = generateAccessToken();
    const intake = generateAccessToken();
    const d = deps();
    d.deps.resolution = resolution([
      { token: review, row: { linkType: "REVIEW" } },
      { token: intake, row: { linkType: "INTAKE" } },
    ]);
    for (const value of [review.rawToken, intake.rawToken, generateAccessToken().rawToken, "wc-2026-000001-common", PROJECT_A]) {
      await expect(loadCustomerPortal(value, d.deps)).rejects.toMatchObject({ kind: "NOT_FOUND" });
    }
    expect(d.rsvpReads).toEqual([]);
  });

  it("R: the view carries no ids, token, hash, phone or note", async () => {
    const json = JSON.stringify(await ready(PORTAL_A.rawToken));
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(json).not.toMatch(/guest_?id|project_?id|token|phone|note|hint/i);
    expect(json).not.toContain(hex(hashAccessToken(PORTAL_A.rawToken)));
  });
});

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === "node_modules" || entry === "__tests__" || entry === ".next") continue;
    const path = join(ROOT, dir, entry);
    if (statSync(path).isDirectory()) out.push(...listSources(relative(ROOT, path)));
    else if (/\.tsx?$/.test(entry)) out.push(relative(ROOT, path));
  }
  return out;
}

describe("033D K, L, S, T: static boundaries", () => {
  it("K/L/S/T: read-only explicit-column RSVP SELECT; no mutation/API/Guest Tool; service_role server-only; metadata unchanged", () => {
    const repo = strip(read("lib/server/supabase/customer-portal-repository.ts"));
    expect(repo).toMatch(/\.from\("rsvps"\)\s+\.select\(\s+"project_id, guest_id, guest_display_name_snapshot, attendance, party_size, message, created_at, updated_at, guest:guests\(project_id, display_name, invitation_variant\)"/);
    expect(repo).toMatch(/\.order\("updated_at", \{ ascending: false \}\)\s+\.order\("id", \{ ascending: false \}\)/);
    expect(repo).not.toMatch(/token_hash|token_hint|token_issued_at|phone|note|\.(insert|update|upsert|delete|rpc)\(/);

    const production = ["app", "lib"].flatMap(listSources);
    expect(production.filter((f) => /portal/i.test(f) && f.startsWith("app/api/"))).toEqual([]);
    const portalUi = ["app/portal/[token]/page.tsx", "app/portal/[token]/portal-rsvp-list.tsx", "lib/server/customer-portal/present-portal-rsvps.ts"].map((f) => strip(read(f))).join("\n");
    expect(portalUi).not.toMatch(/issueGuestLink|regenerate|revoke|createGuest|<form|<button|onClick|service-role-client|SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage/);
    expect(read("app/portal/[token]/portal-rsvp-list.tsx")).not.toMatch(/^"use client"/m);

    const page = strip(read("app/portal/[token]/page.tsx"));
    expect(page).toMatch(/title: "Cổng khách hàng — WeddingClick",\s+robots: \{ index: false, follow: false \},\s+referrer: "no-referrer",/);
    expect(page).toMatch(/export const dynamic = "force-dynamic"/);
    expect(page).not.toMatch(/openGraph|generateMetadata/);
  });
});
