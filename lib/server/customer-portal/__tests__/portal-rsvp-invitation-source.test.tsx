import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PortalRsvpList } from "../../../../app/portal/[token]/portal-rsvp-list";
import { buildRendererFixture } from "../../../../templates/core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_TEMPLATE_VERSION_ID } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import { generateAccessToken } from "../../auth/access-token-crypto";
import type { AccessLinkResolutionRepository } from "../../supabase/access-link-resolution-repository";
import { toPortalRsvps } from "../../supabase/customer-portal-repository";
import type { CustomerPortalGateway, CustomerPortalView, PortalProjectRecord } from "../customer-portal-types";
import { loadCustomerPortal } from "../load-customer-portal";

/**
 * RSVP-P0-02 — responses submitted through the separate GROOM and BRIDE
 * public links must be attributed to the link they came from, and the
 * Customer Portal must show each side on its own.
 *
 * The source is only ever `rsvps.invitation_id` (migration 0055), recorded
 * server-side from the validated currently PUBLISHED slug. Nothing here may
 * infer a side from a guest's own variant, a typed name or a row's age: a
 * row with no recorded source stays unclassified.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const M0055 = "20260911041215_0055_rsvp_invitation_source.sql";
const sql = readFileSync(join(MIGRATIONS, M0055), "utf8");
const executable = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const PROJECT_A = "a0000000-0000-4000-8000-00000000000a";
const PROJECT_B = "b0000000-0000-4000-8000-00000000000b";
const INV_GROOM = "d0000000-0000-4000-8000-0000000000d1";
const INV_BRIDE = "d0000000-0000-4000-8000-0000000000d2";
const INV_OTHER_PROJECT = "d0000000-0000-4000-8000-0000000000d9";
const VER_GROOM = "e0000000-0000-4000-8000-0000000000e1";
const VER_BRIDE = "e0000000-0000-4000-8000-0000000000e2";
const GUEST_GROOM = "f0000000-0000-4000-8000-0000000000f1";

const PORTAL = generateAccessToken();

/** Raw DB-shaped RSVP row, exactly as the repository SELECT returns it. */
const dbRow = (patch: Record<string, unknown> = {}) => ({
  project_id: PROJECT_A,
  invitation_id: null,
  guest_id: null,
  guest_display_name_snapshot: "Khách",
  attendance: "ATTENDING",
  party_size: 2,
  message: null,
  created_at: "2026-10-01T03:00:00Z",
  updated_at: "2026-10-01T03:00:00Z",
  guest: null,
  ...patch,
});

/** A SEPARATE Project with both sides published (the defect's shape). */
async function separateRecord(packageCode = "SEPARATE"): Promise<PortalProjectRecord> {
  const groom = (await buildRendererFixture({ variant: "GROOM" })).snapshot;
  const bride = (await buildRendererFixture({ variant: "BRIDE" })).snapshot;
  const version = (id: string, invitationId: string, snapshot: typeof groom) => ({
    id,
    invitationId,
    projectId: PROJECT_A,
    versionType: "PUBLISHED",
    templateVersionId: FIXTURE_TEMPLATE_VERSION_ID,
    rendererKey: snapshot.template.rendererKey,
    payload: snapshot,
  });
  return {
    projectCode: groom.project.code,
    packageCode,
    invitations: [
      { id: INV_GROOM, variant: "GROOM", publicSlug: "wc-a-groom", publishedVersionId: VER_GROOM, publicAlias: null },
      { id: INV_BRIDE, variant: "BRIDE", publicSlug: "wc-a-bride", publishedVersionId: VER_BRIDE, publicAlias: null },
    ],
    versions: [version(VER_GROOM, INV_GROOM, groom), version(VER_BRIDE, INV_BRIDE, bride)],
    personalizedGuestEntitled: false,
  };
}

function resolution(): AccessLinkResolutionRepository {
  return {
    async lookupByTokenHash(hash) {
      const match = Buffer.from(PORTAL.tokenHash).equals(Buffer.from(hash));
      return match ? { id: INV_GROOM, projectId: PROJECT_A, linkType: "PORTAL", expiresAt: null, revokedAt: null } : null;
    },
    async touchLastUsedAt() {},
  };
}

async function ready(rows: Record<string, unknown>[], packageCode = "SEPARATE") {
  const record = await separateRecord(packageCode);
  const portal: CustomerPortalGateway = {
    getPortalProject: async () => record,
    listPortalRsvps: async (projectId) => toPortalRsvps(rows, projectId),
  };
  const view = await loadCustomerPortal(PORTAL.rawToken, {
    resolution: resolution(),
    portal,
    guests: { listGuests: async () => [], listGuestRsvps: async () => [] },
  });
  if (view.status !== "READY") throw new Error("expected READY");
  return view;
}

const groupsOf = (view: Extract<CustomerPortalView, { status: "READY" }>) =>
  Object.fromEntries(view.rsvps.groups.map((group) => [group.key, group]));

// ---------------------------------------------------------------------------
// A. Migration 0055
// ---------------------------------------------------------------------------

describe("migration 0055 — rsvps.invitation_id", () => {
  it("is the one 0055, still the last migration before RSVP-P0-03's 0056, authored only", () => {
    const names = readdirSync(MIGRATIONS).sort();
    expect(names.at(-1)).toBe("20260911041216_0056_generic_rsvp_response_key.sql");
    expect(names.at(-2)).toBe(M0055);
    expect(names.filter((name) => /_0055_/.test(name))).toStrictEqual([M0055]);
    expect(sql).toContain("AUTHORING ONLY — not applied.");
  });

  it("adds one optional column with same-Project integrity and no backfill", () => {
    expect(executable).toMatch(/ADD COLUMN invitation_id UUID NULL;/);
    // No default and no value written into existing rows, in either direction.
    expect(executable).not.toMatch(/invitation_id UUID[^;]*DEFAULT|UPDATE public\.rsvps|SET invitation_id =(?! EXCLUDED)/);
    expect(executable).toMatch(
      /ADD CONSTRAINT rsvps_invitation_fk\s+FOREIGN KEY \(invitation_id, project_id\)\s+REFERENCES public\.project_invitations \(id, project_id\)\s+ON DELETE NO ACTION;/,
    );
    // The post-condition refuses to leave any historical row attributed.
    expect(executable).toMatch(/SELECT 1 FROM public\.rsvps WHERE invitation_id IS NOT NULL/);
  });

  it("changes only the two public RSVP writers, keeping their hardening, signatures and grants", () => {
    expect(executable.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
    expect(executable).toMatch(/CREATE OR REPLACE FUNCTION public\.submit_public_rsvp\(/);
    expect(executable).toMatch(/CREATE OR REPLACE FUNCTION public\.submit_public_guest_rsvp\(/);
    expect(executable.match(/SECURITY DEFINER\s+SET search_path = ''/g)).toHaveLength(2);
    // No new object, privilege or policy, and no replacement of the resolver.
    expect(executable).not.toMatch(/GRANT |REVOKE |CREATE POLICY|CREATE INDEX|DROP |ALTER TABLE public\.(?!rsvps)|resolve_public_guest\(\s*\n|USING \(true\)/);
    expect(executable).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(resolve_public_guest|get_public_guest_invitation)/);
    // No caller-supplied invitation: both parameter lists are unchanged.
    expect(executable).not.toMatch(/p_invitation_id|p_invitation|p_variant/);
  });

  it("derives the source only from the validated slug, pinned to the resolved Project", () => {
    // Generic: the invitation already resolved from the slug in step B is persisted.
    expect(executable).toMatch(/VALUES \(\s+v_project_id,\s+v_invitation_id,\s+NULL,\s+p_guest_name,/);
    // Personalized: re-derived from the same slug AND the Project the token resolved to.
    expect(executable).toMatch(
      /SELECT pi\.id INTO v_invitation_id\s+FROM public\.project_invitations AS pi\s+WHERE pi\.public_slug = p_public_slug\s+AND pi\.project_id = v_project_id\s+AND pi\.published_version_id IS NOT NULL;/,
    );
    expect(executable).toMatch(/VALUES \(\s+v_project_id,\s+v_invitation_id,\s+v_guest_id,\s+p_guest_name,/);
  });

  it("keeps one current personalized response, with its source replaced on resubmission", () => {
    expect(executable).toMatch(/ON CONFLICT \(guest_id\) WHERE guest_id IS NOT NULL\s+DO UPDATE SET\s+invitation_id\s+= EXCLUDED\.invitation_id,/);
    expect(executable).toMatch(/rsvps_guest_id_key must still exist/);
  });

  it("edits no earlier migration", () => {
    const diff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "supabase/migrations"], { cwd: ROOT, encoding: "utf8" });
    expect(diff.trim()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// B. Repository guard
// ---------------------------------------------------------------------------

describe("RSVP-P0-02 repository guard", () => {
  it("accepts a UUID source or none, and fails closed on anything else", () => {
    expect(toPortalRsvps([dbRow({ invitation_id: INV_GROOM })], PROJECT_A)[0]?.invitationId).toBe(INV_GROOM);
    expect(toPortalRsvps([dbRow()], PROJECT_A)[0]?.invitationId).toBeNull();
    for (const invalid of ["GROOM", "", "not-a-uuid", 7, {}]) {
      expect(() => toPortalRsvps([dbRow({ invitation_id: invalid })], PROJECT_A)).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// C. Customer Portal — grouping, totals and labels
// ---------------------------------------------------------------------------

describe("RSVP-P0-02 Portal grouping for a SEPARATE package", () => {
  it("attributes each generic response to the link it was submitted through", async () => {
    const view = await ready([
      dbRow({ invitation_id: INV_GROOM, guest_display_name_snapshot: "Bạn nhà trai", updated_at: "2026-10-03T03:00:00Z" }),
      dbRow({ invitation_id: INV_BRIDE, guest_display_name_snapshot: "Bạn nhà gái", updated_at: "2026-10-02T03:00:00Z" }),
    ]);
    const groups = groupsOf(view);
    expect(view.rsvps.layout).toBe("BY_SIDE");
    expect(view.rsvps.groups.map((g) => g.key)).toEqual(["GROOM", "BRIDE", "ALL"]);
    expect(groups.GROOM?.rows.map((r) => [r.guestName, r.source])).toEqual([["Bạn nhà trai", "GROOM"]]);
    expect(groups.BRIDE?.rows.map((r) => [r.guestName, r.source])).toEqual([["Bạn nhà gái", "BRIDE"]]);
    expect(groups.ALL?.rows.map((r) => r.guestName)).toEqual(["Bạn nhà trai", "Bạn nhà gái"]);
  });

  it("gives each side its own summary and counts every stored response exactly once overall", async () => {
    const view = await ready([
      dbRow({ invitation_id: INV_GROOM, attendance: "ATTENDING", party_size: 2 }),
      dbRow({ invitation_id: INV_GROOM, attendance: "MAYBE", party_size: 3 }),
      dbRow({ invitation_id: INV_BRIDE, attendance: "ATTENDING", party_size: 4 }),
      dbRow({ invitation_id: null, attendance: "NOT_ATTENDING", party_size: 0 }),
    ]);
    const groups = groupsOf(view);
    expect(groups.GROOM?.summary).toEqual({ responses: { ATTENDING: 1, MAYBE: 1, NOT_ATTENDING: 0 }, people: { ATTENDING: 2, MAYBE: 3, NOT_ATTENDING: 0 } });
    expect(groups.BRIDE?.summary).toEqual({ responses: { ATTENDING: 1, MAYBE: 0, NOT_ATTENDING: 0 }, people: { ATTENDING: 4, MAYBE: 0, NOT_ATTENDING: 0 } });
    expect(groups.ALL?.summary).toEqual({ responses: { ATTENDING: 2, MAYBE: 1, NOT_ATTENDING: 1 }, people: { ATTENDING: 6, MAYBE: 3, NOT_ATTENDING: 0 } });
    expect(groups.ALL?.rows).toHaveLength(4);
    // Overall is the whole list, not the two sides added up: the unattributed row is in it.
    expect((groups.GROOM?.rows.length ?? 0) + (groups.BRIDE?.rows.length ?? 0)).toBe(3);
  });

  it("leaves a response with no recorded source unclassified — in Tổng hợp only, never on a family's side", async () => {
    const view = await ready([
      // A pre-0055 row, and a pre-0055 row of a PERSONALIZED groom-side guest:
      // the guest's own side is never promoted to a submission source.
      dbRow({ guest_display_name_snapshot: "Khách cũ" }),
      dbRow({
        guest_id: GUEST_GROOM,
        guest_display_name_snapshot: "Hiếu nè",
        guest: { project_id: PROJECT_A, display_name: "Anh Hiếu và gia đình", invitation_variant: "GROOM" },
      }),
    ]);
    const groups = groupsOf(view);
    expect(groups.GROOM?.rows).toEqual([]);
    expect(groups.BRIDE?.rows).toEqual([]);
    expect(groups.ALL?.rows.map((r) => [r.guestName, r.source, r.invitationVariant])).toEqual([
      ["Khách cũ", "UNKNOWN", null],
      ["Anh Hiếu và gia đình", "UNKNOWN", "GROOM"],
    ]);
  });

  it("keeps personalized guest identity distinct from the link the response came through", async () => {
    const view = await ready([
      dbRow({
        invitation_id: INV_BRIDE,
        guest_id: GUEST_GROOM,
        guest_display_name_snapshot: "Hiếu nè",
        guest: { project_id: PROJECT_A, display_name: "Anh Hiếu và gia đình", invitation_variant: "GROOM" },
      }),
    ]);
    const groups = groupsOf(view);
    // Identity says GROOM (the guest's own side); the source says BRIDE (the link used).
    expect(groups.ALL?.rows[0]).toMatchObject({ kind: "PERSONALIZED", guestName: "Anh Hiếu và gia đình", respondedAs: "Hiếu nè", invitationVariant: "GROOM", source: "BRIDE" });
    expect(groups.BRIDE?.rows).toHaveLength(1);
    expect(groups.GROOM?.rows).toEqual([]);
  });

  it("never attributes a response to an invitation this Project does not own", async () => {
    const view = await ready([dbRow({ invitation_id: INV_OTHER_PROJECT })]);
    const groups = groupsOf(view);
    expect(groups.ALL?.rows.map((r) => r.source)).toEqual(["UNKNOWN"]);
    expect(groups.GROOM?.rows).toEqual([]);
    expect(groups.BRIDE?.rows).toEqual([]);
    // A row of another Project never reaches the view at all (033D guard).
    expect(() => toPortalRsvps([dbRow({ project_id: PROJECT_B, invitation_id: INV_OTHER_PROJECT })], PROJECT_A)).toThrow();
    expect(JSON.stringify(view)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("COMMON packages keep the single list; an unrecognized package is refused rather than grouped by guess", async () => {
    const view = await ready([dbRow({ invitation_id: INV_GROOM })], "COMMON");
    expect(view.rsvps.layout).toBe("SINGLE");
    expect(view.rsvps.groups.map((g) => g.key)).toEqual(["ALL"]);
    expect(view.rsvps.groups[0]?.rows).toHaveLength(1);
    await expect(ready([dbRow()], "PREMIUM")).rejects.toThrow(/Unsupported package/);
  });
});

describe("RSVP-P0-02 Portal rendering", () => {
  it("shows Nhà trai / Nhà gái / Tổng hợp with honest source labels and no controls", async () => {
    const view = await ready([
      dbRow({ invitation_id: INV_GROOM, guest_display_name_snapshot: "Bạn nhà trai" }),
      dbRow({ invitation_id: INV_BRIDE, guest_display_name_snapshot: "Bạn nhà gái" }),
      dbRow({ guest_display_name_snapshot: "Khách cũ" }),
    ]);
    const html = renderToStaticMarkup(<PortalRsvpList view={view.rsvps} />);
    for (const text of [
      "Nhà trai",
      "Nhà gái",
      "Tổng hợp",
      "Phản hồi từ link thiệp nhà trai",
      "Phản hồi từ link thiệp nhà gái",
      "Chưa xác định nguồn",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Phản hồi từ link chung");
    expect(html).not.toMatch(/<button|<form|<input|onClick|href=/);
    expect(html).not.toContain(INV_GROOM);
  });

  it("an empty side says so instead of borrowing the other side's responses", async () => {
    const view = await ready([dbRow({ invitation_id: INV_GROOM, guest_display_name_snapshot: "Bạn nhà trai" })]);
    const html = renderToStaticMarkup(<PortalRsvpList view={view.rsvps} />);
    expect(html).toContain('data-portal-rsvp-empty="BRIDE"');
    expect(html).not.toContain('data-portal-rsvp-empty="GROOM"');
    expect(html.match(/Bạn nhà trai/g)).toHaveLength(2); // its own side, and Tổng hợp
  });

  it("a COMMON Project still renders exactly one list", async () => {
    const view = await ready([dbRow({ invitation_id: INV_GROOM, guest_display_name_snapshot: "Bạn Lan" })], "COMMON");
    const html = renderToStaticMarkup(<PortalRsvpList view={view.rsvps} />);
    expect(html).toContain('data-portal-rsvps="SINGLE"');
    expect(html).not.toContain("Tổng hợp");
    expect(html.match(/Bạn Lan/g)).toHaveLength(1);
  });
});
