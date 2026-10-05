import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildRendererFixture } from "../../../../templates/core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_TEMPLATE_VERSION_ID } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import type { InvitationVariant } from "../../../domain";
import { generateAccessToken, hashAccessToken } from "../../auth/access-token-crypto";
import { ApiError } from "../../errors/api-error";
import type { AccessLinkResolutionRepository, ResolvedAccessLinkRow } from "../../supabase/access-link-resolution-repository";
import { toPortalInvitations, toPortalVersions } from "../../supabase/customer-portal-repository";
import type { PortalProjectRecord } from "../customer-portal-types";
import { loadCustomerPortal } from "../load-customer-portal";

/**
 * Task 033C — private Customer Portal foundation: PORTAL-only resolution,
 * exactly one Project, current PUBLISHED pointers only, read-only summary,
 * no RSVP / Guest Tool, private metadata.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PROJECT_A = "a0000000-0000-4000-8000-00000000000a";
const PROJECT_B = "b0000000-0000-4000-8000-00000000000b";
const LINK_ID = "c0000000-0000-4000-8000-0000000000c1";
const ids: Record<InvitationVariant, { inv: string; ver: string }> = {
  COMMON: { inv: "d0000000-0000-4000-8000-0000000000d1", ver: "e0000000-0000-4000-8000-0000000000e1" },
  GROOM: { inv: "d0000000-0000-4000-8000-0000000000d2", ver: "e0000000-0000-4000-8000-0000000000e2" },
  BRIDE: { inv: "d0000000-0000-4000-8000-0000000000d3", ver: "e0000000-0000-4000-8000-0000000000e3" },
};

const PORTAL = generateAccessToken();
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/** Fake Task 026 link table: token hash → row. */
function resolution(rows: { token: ReturnType<typeof generateAccessToken>; row: Partial<ResolvedAccessLinkRow> }[]) {
  const touched: string[] = [];
  const repo: AccessLinkResolutionRepository = {
    async lookupByTokenHash(hash) {
      const hit = rows.find((r) => hex(r.token.tokenHash) === hex(hash));
      return hit === undefined
        ? null
        : { id: LINK_ID, projectId: PROJECT_A, linkType: "PORTAL", expiresAt: null, revokedAt: null, ...hit.row };
    },
    async touchLastUsedAt(id) {
      touched.push(id);
    },
  };
  return { repo, touched };
}

async function publication(variant: InvitationVariant, projectId = PROJECT_A) {
  const snapshot = (await buildRendererFixture({ variant })).snapshot;
  return {
    snapshot,
    invitation: { id: ids[variant].inv, variant, publicSlug: `${snapshot.project.code.toLowerCase()}-${variant.toLowerCase()}`, publishedVersionId: ids[variant].ver },
    version: {
      id: ids[variant].ver,
      invitationId: ids[variant].inv,
      projectId,
      versionType: "PUBLISHED",
      templateVersionId: FIXTURE_TEMPLATE_VERSION_ID,
      rendererKey: snapshot.template.rendererKey,
      payload: snapshot,
    },
  };
}

async function projectRecord(variants: InvitationVariant[], overrides: Partial<PortalProjectRecord> = {}): Promise<PortalProjectRecord> {
  const pubs = await Promise.all(variants.map((v) => publication(v)));
  return {
    projectCode: (await buildRendererFixture({ variant: "COMMON" })).snapshot.project.code,
    invitations: pubs.map((p) => p.invitation),
    versions: pubs.map((p) => p.version),
    personalizedGuestEntitled: false,
    ...overrides,
  };
}

function portalDeps(record: PortalProjectRecord, links = resolution([{ token: PORTAL, row: {} }])) {
  const projectIds: string[] = [];
  return {
    projectIds,
    touched: links.touched,
    deps: {
      resolution: links.repo,
      portal: {
        async getPortalProject(projectId: string) {
          projectIds.push(projectId);
          return record;
        },
      },
    },
  };
}

describe("A–E: PORTAL-only token resolution", () => {
  it("A: a valid PORTAL token resolves exactly its Project and touches last_used_at", async () => {
    const d = portalDeps(await projectRecord(["COMMON"]));
    const view = await loadCustomerPortal(PORTAL.rawToken, d.deps);
    expect(view.status).toBe("READY");
    expect(d.projectIds).toEqual([PROJECT_A]);
    expect(d.touched).toEqual([LINK_ID]);
  });

  it.each(["REVIEW", "INTAKE"] as const)("B: a %s link never opens the Portal (NOT_FOUND, nothing read)", async (linkType) => {
    const review = generateAccessToken();
    const d = portalDeps(await projectRecord(["COMMON"]), resolution([{ token: review, row: { linkType } }]));
    await expect(loadCustomerPortal(review.rawToken, d.deps)).rejects.toMatchObject({ kind: "NOT_FOUND" });
    expect(d.projectIds).toEqual([]);
    expect(d.touched).toEqual([]);
  });

  it("C/D: guest tokens, public slugs, unknown and malformed values are NOT_FOUND with no Project read", async () => {
    const d = portalDeps(await projectRecord(["COMMON"]));
    for (const value of [generateAccessToken().rawToken, "wc-2026-000001-common", "", "x".repeat(44), PROJECT_A]) {
      await expect(loadCustomerPortal(value, d.deps)).rejects.toMatchObject({ kind: "NOT_FOUND" });
    }
    expect(d.projectIds).toEqual([]);
  });

  it.each([
    ["revoked", { revokedAt: "2026-10-01T00:00:00Z" }, "REVOKED_TOKEN"],
    ["expired", { expiresAt: "2020-01-01T00:00:00Z" }, "EXPIRED_TOKEN"],
  ] as const)("E: a %s PORTAL link → %s (410 contract), nothing read", async (_label, row, kind) => {
    const d = portalDeps(await projectRecord(["COMMON"]), resolution([{ token: PORTAL, row }]));
    await expect(loadCustomerPortal(PORTAL.rawToken, d.deps)).rejects.toMatchObject({ kind });
    expect(d.projectIds).toEqual([]);
  });
});

describe("F–J: publication eligibility and summary", () => {
  it("F: no published invitation → NOT_READY (no summary, no links)", async () => {
    const d = portalDeps(await projectRecord([]));
    expect(await loadCustomerPortal(PORTAL.rawToken, d.deps)).toEqual({ status: "NOT_READY" });
  });

  it("G: COMMON Project shows exactly its COMMON link and canonical names/ceremony from the PUBLISHED Snapshot", async () => {
    const rec = await projectRecord(["COMMON"]);
    const view = await loadCustomerPortal(PORTAL.rawToken, portalDeps(rec).deps);
    if (view.status !== "READY") throw new Error("expected READY");
    expect(view.invitations.map((c) => [c.variant, c.invitationPath])).toEqual([["COMMON", `/i/${rec.invitations[0].publicSlug}`]]);
    const snap = (await publication("COMMON")).snapshot;
    const primary = snap.people.primarySide === "GROOM" ? snap.people.groom.name : snap.people.bride.name;
    expect(view.invitations[0].primaryName).toBe(primary);
    expect(view.invitations[0].ceremonyTitle).toBe(snap.ceremony.title);
    expect(view.invitations[0].ceremonyDate.year).toMatch(/^\d{4}$/);
  });

  it("H: SEPARATE Project shows GROOM then BRIDE, each with its own variant order and rite", async () => {
    const view = await loadCustomerPortal(PORTAL.rawToken, portalDeps(await projectRecord(["BRIDE", "GROOM"])).deps);
    if (view.status !== "READY") throw new Error("expected READY");
    expect(view.invitations.map((c) => c.variant)).toEqual(["GROOM", "BRIDE"]);
    const [groom, bride] = view.invitations;
    expect(groom.primaryName).toBe(bride.secondaryName);
    expect(groom.ceremonyTitle).toBe("Lễ Thành Hôn");
    expect(bride.ceremonyTitle).toBe("Lễ Vu Quy");
  });

  it("H: only variants with a published pointer appear — a missing variant is never invented", async () => {
    const view = await loadCustomerPortal(PORTAL.rawToken, portalDeps(await projectRecord(["GROOM"])).deps);
    if (view.status !== "READY") throw new Error("expected READY");
    expect(view.invitations.map((c) => c.variant)).toEqual(["GROOM"]);
  });

  it.each([
    ["a REVIEW row behind the pointer", { versionType: "REVIEW" }],
    ["a version of another invitation", { invitationId: ids.BRIDE.inv }],
    ["a version of another Project (I)", { projectId: PROJECT_B }],
  ])("I/J: %s fails closed (integrity fault, no partial render)", async (_label, patch) => {
    const rec = await projectRecord(["COMMON"]);
    rec.versions = [{ ...rec.versions[0], ...patch }];
    await expect(loadCustomerPortal(PORTAL.rawToken, portalDeps(rec).deps)).rejects.toThrow();
  });

  it("I/J: a stored Snapshot naming another Project code fails closed; a missing pointer target fails closed", async () => {
    const other = await projectRecord(["COMMON"], { projectCode: "WC-2099-999999" });
    await expect(loadCustomerPortal(PORTAL.rawToken, portalDeps(other).deps)).rejects.toThrow(/different Project/);
    const missing = await projectRecord(["COMMON"], { versions: [] });
    await expect(loadCustomerPortal(PORTAL.rawToken, portalDeps(missing).deps)).rejects.toThrow(/integrity/);
  });

  it("the view carries no ids, storage paths, renderer data, token or hash", async () => {
    const view = await loadCustomerPortal(PORTAL.rawToken, portalDeps(await projectRecord(["GROOM", "BRIDE"], { personalizedGuestEntitled: true })).deps);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(json).not.toMatch(/storage|rendererKey|templateVersion|payload|signed|https?:/i);
    expect(json).not.toContain(PORTAL.rawToken);
    expect(json).not.toContain(hex(hashAccessToken(PORTAL.rawToken)));
    expect(view).toMatchObject({ status: "READY", personalizedGuestEntitled: true });
  });

  it("repository row guards reject malformed rows", () => {
    expect(() => toPortalInvitations([{ id: "x", variant: "COMMON", public_slug: "a", published_version_id: ids.COMMON.ver }])).toThrow();
    expect(() => toPortalInvitations([{ id: ids.COMMON.inv, variant: "OTHER", public_slug: "a", published_version_id: ids.COMMON.ver }])).toThrow();
    expect(() => toPortalVersions([{ id: ids.COMMON.ver }])).toThrow();
    expect(toPortalInvitations([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// K–P: static boundaries
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

const PAGE = "app/portal/[token]/page.tsx";
const COPY = "app/portal/[token]/portal-link-copy.tsx";
const REPO = "lib/server/supabase/customer-portal-repository.ts";
const USE_CASE = "lib/server/customer-portal/load-customer-portal.ts";
const WIRING = "lib/server/customer-portal/customer-portal-supabase.ts";

describe("K–P: boundaries", () => {
  it("K/L: no RSVP, guest, media, payment, review or write path anywhere in the portal", () => {
    const code = [PAGE, COPY, REPO, USE_CASE, WIRING, "lib/server/customer-portal/customer-portal-types.ts"].map((f) => strip(read(f))).join("\n");
    expect(code).not.toMatch(/rsvps|"guests"|project_media|\.storage\b|payment_status|review_feedback|current_review_version_id|wedding_details/);
    expect(code).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    expect(PRODUCTION.filter((f) => f.startsWith("app/api/") && /portal/i.test(f))).toEqual([]);
  });

  it("the repository queries exactly the four Project-scoped tables, each filtered by the resolved projectId", () => {
    const repo = strip(read(REPO));
    expect([...repo.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])).toEqual(["projects", "project_invitations", "invitation_versions", "project_addons"]);
    expect(repo.match(/\.eq\("project_id", projectId\)/g)).toHaveLength(3);
    expect(repo).toMatch(/\.eq\("id", projectId\)/);
    expect(repo).not.toMatch(/console\./);
  });

  it("M: metadata is fixed — noindex/nofollow, no-referrer, no Open Graph, no token; the page is force-dynamic", async () => {
    const page = strip(read(PAGE));
    expect(page).toMatch(/title: "Cổng khách hàng — WeddingClick",\s+robots: \{ index: false, follow: false \},\s+referrer: "no-referrer",/);
    expect(page).not.toMatch(/openGraph|generateMetadata|alternates|canonical|og:/);
    expect(page).toMatch(/export const dynamic = "force-dynamic"/);
    expect(page).toMatch(/expectedLinkType|loadCustomerPortal\(token, createCustomerPortalPageDependencies\(\)\)/);
  });

  it("M: logging is a fixed string; the shell renders placeholders, not fake controls", () => {
    const page = read(PAGE);
    for (const line of page.split("\n").filter((l) => /console\./.test(l))) expect(line).toMatch(/console\.error\("\[CustomerPortalPage\] Unexpected error"\);/);
    expect(page).toContain("Phản hồi tham dự sẽ được hiển thị tại đây.");
    expect(page).not.toMatch(/<button|onClick|<form/);
  });

  it("N/O: staff PORTAL issue/rotate reuse the Task 026 routes; the raw URL lives only in component state", () => {
    const client = strip(read("lib/admin/admin-api-client.ts"));
    expect(client).toMatch(/\/access-links`,\s+token,\s+\{ method: "POST", body: \{ linkType: "PORTAL" \} \}/);
    expect(client).toMatch(/\/access-links\/\$\{encodeURIComponent\(accessLinkId\)\}\/rotate`/);
    const tab = strip(read("app/admin/v2/projects/[projectId]/_components/publish-tab.tsx"));
    expect(tab).toMatch(/`\$\{window\.location\.origin\}\/portal\/\$\{encodeURIComponent\(link\.token\)\}`/);
    expect(tab).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
    expect(tab).toMatch(/data\.variants\.some\(\(row\) => row\.publishedVersion !== null\) && <PortalLinkIssuer/);
    expect(PRODUCTION.filter((f) => f.startsWith("lib/server/") && /portal/i.test(f) && /access-link-staff|issue_review_link|rotate_access_link/.test(read(f)))).toEqual([]);
  });

  it("P: service_role only in the portal repository; wiring imported only by the page; nothing client-side touches the server modules", () => {
    expect(importersOf("customer-portal-repository")).toEqual([WIRING]);
    expect(importersOf("customer-portal-supabase")).toEqual([PAGE]);
    for (const f of [PAGE, COPY, USE_CASE, WIRING]) expect(read(f), f).not.toMatch(/service-role-client|SUPABASE_SERVICE_ROLE_KEY|createServiceRole/);
    expect(read(COPY)).toMatch(/^"use client";/);
    expect(read(COPY)).not.toMatch(/lib\/server|token/);
    expect(read(PAGE)).not.toMatch(/^"use client"/m);
  });

  it("the copy component copies only the public /i/ path it is given", async () => {
    const { PortalLinkCopy } = await import("../../../../app/portal/[token]/portal-link-copy");
    const html = renderToStaticMarkup(<PortalLinkCopy path="/i/wc-2026-000001-common" />);
    expect(html).toContain("Sao chép link");
    expect(html).not.toMatch(/portal|token/i);
    expect(ApiError).toBeDefined();
  });
});
