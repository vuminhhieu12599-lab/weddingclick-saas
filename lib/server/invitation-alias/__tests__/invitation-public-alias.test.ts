import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { buildRendererFixture } from "../../../../templates/core/fixtures/renderer-fixture-pipeline";
import {
  buildInvitationPublicAlias,
  deriveInvitationPublicAlias,
  invitationPublicAliasPath,
  isWellFormedInvitationPublicAlias,
  slugifyPersonName,
  type InvitationVariant,
} from "../../../domain";
import type { StaffContext } from "../../auth/staff-context";
import { evaluatePublicLinks } from "../../invitation-publish/get-project-publish-state";
import type { RequiredVariantPublishState } from "../../invitation-publish/invitation-publish-types";
import { resolvePublicInvitationRouteSlug, type PublicInvitationAliasGateway } from "../../public-invitation/resolve-public-invitation-route";
import { handleAssignInvitationAliasRequest } from "../../routes/invitation-alias";
import { toPortalAliases, toPortalInvitations } from "../../supabase/customer-portal-repository";
import { toInvitationPublicLinks } from "../../supabase/invitation-alias-repository";
import { assignInvitationPublicAlias, parseAssignInvitationAliasCommand } from "../assign-invitation-public-alias";
import { mapInvitationAliasRpcError } from "../invitation-alias-rpc-error-codes";
import type { AssignedInvitationAliasRecord, InvitationAliasGateway, PublishedSnapshotRecord } from "../invitation-alias-types";

/** LAUNCH-P0-02 — human-friendly public URLs for SEPARATE invitations (migration 0049). */

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const M0049 = "supabase/migrations/20260911041209_0049_invitation_public_aliases.sql";

const PROJECT_A = "a0000000-0000-4000-8000-00000000000a";
const PROJECT_B = "b0000000-0000-4000-8000-00000000000b";
const INV_GROOM = "c0000000-0000-4000-8000-0000000000c1";
const INV_BRIDE = "c0000000-0000-4000-8000-0000000000c2";
const staff = { supabase: "client", userId: "u", role: "STAFF" } as unknown as StaffContext<string>;

async function published(variant: InvitationVariant): Promise<PublishedSnapshotRecord> {
  const { snapshot } = await buildRendererFixture({ variant });
  return { invitationId: INV_GROOM, templateVersionId: snapshot.template.templateVersionId, rendererKey: snapshot.template.rendererKey, payload: snapshot };
}

function gateway(overrides: Partial<InvitationAliasGateway<string>> = {}) {
  const assignAlias = vi.fn(
    async (_c: string, p: { projectId: string; variant: "GROOM" | "BRIDE"; alias: string }): Promise<AssignedInvitationAliasRecord> => ({
      invitationId: INV_GROOM,
      projectId: p.projectId,
      variant: p.variant,
      alias: p.alias,
      createdAt: "2026-10-12T00:00:00.000Z",
    }),
  );
  return { assignAlias, getPublishedSnapshot: vi.fn(async (_c: string, _p: string, v: "GROOM" | "BRIDE") => published(v)), ...overrides };
}

describe("alias normalization (domain)", () => {
  it("removes Vietnamese accents, maps đ/Đ to d, lowercases and hyphenates words", () => {
    expect(slugifyPersonName("Minh Anh")).toBe("minh-anh");
    expect(slugifyPersonName("Thu Hà")).toBe("thu-ha");
    expect(slugifyPersonName("Đặng Đức Đạt")).toBe("dang-duc-dat");
    expect(slugifyPersonName("NGUYỄN THỊ HỒNG NHUNG")).toBe("nguyen-thi-hong-nhung");
    expect(slugifyPersonName("Trần Ngọc Hân")).toBe("tran-ngoc-han");
    expect(slugifyPersonName("  Lê   Văn  Tám  ")).toBe("le-van-tam");
    expect(slugifyPersonName("Phạm Quỳnh Như (Bé)")).toBe("pham-quynh-nhu-be");
    expect(slugifyPersonName("Ưng Hoàng Phúc")).toBe("ung-hoang-phuc");
    // Decomposed input (NFD) gives the same result as precomposed.
    expect(slugifyPersonName("Thu Hà".normalize("NFD"))).toBe("thu-ha");
    expect(slugifyPersonName("❤️ ♥")).toBeNull();
    expect(slugifyPersonName("")).toBeNull();
  });

  it("GROOM orders groom&bride, BRIDE orders bride&groom, COMMON has no alias (Rule of Three)", () => {
    const names = { groomName: "Minh Anh", brideName: "Thu Hà" };
    expect(deriveInvitationPublicAlias("GROOM", names)).toBe("minh-anh&thu-ha");
    expect(deriveInvitationPublicAlias("BRIDE", names)).toBe("thu-ha&minh-anh");
    expect(deriveInvitationPublicAlias("COMMON", names)).toBeNull();
  });

  it("never suffixes: an unusable or too-long name gives null, not a number or random string", () => {
    expect(buildInvitationPublicAlias("Minh Anh", "!!!")).toBeNull();
    expect(buildInvitationPublicAlias("a".repeat(60), "b".repeat(60))).toBeNull();
    expect(buildInvitationPublicAlias("a".repeat(49), "b".repeat(50))).toBe(`${"a".repeat(49)}&${"b".repeat(50)}`);
  });

  it("alias shape: literal & between two name slugs, disjoint from the canonical slug shape", () => {
    expect(isWellFormedInvitationPublicAlias("minh-anh&thu-ha")).toBe(true);
    for (const bad of ["minh-anh", "Minh-anh&thu-ha", "minh-anh&&thu-ha", "a&b&c", "&thu-ha", "minh-anh&", "minh--anh&thu-ha", "minh anh&thu-ha", "minh-anh%26thu-ha", "wc-2026-000003-groom"]) {
      expect(isWellFormedInvitationPublicAlias(bad)).toBe(false);
    }
    expect(invitationPublicAliasPath("minh-anh&thu-ha")).toBe("/i/minh-anh&thu-ha");
  });

  it("the domain shape matches the 0049 table CHECK and RPC guard exactly", () => {
    const sql = read(M0049);
    const pattern = "'^[a-z0-9]+(-[a-z0-9]+)*&[a-z0-9]+(-[a-z0-9]+)*$'";
    expect(sql.split(pattern).length - 1).toBe(2);
    expect(sql.match(/char_length\(\w+\) (?:<=|>) 100/g)).toHaveLength(2);
  });
});

describe("assignInvitationPublicAlias (staff use case)", () => {
  it("strict body: GROOM/BRIDE only, optional well-formed alias, no extra keys", () => {
    expect(parseAssignInvitationAliasCommand({ variant: "GROOM" })).toEqual({ variant: "GROOM", alias: null });
    expect(parseAssignInvitationAliasCommand({ variant: "BRIDE", alias: "ha&anh" })).toEqual({ variant: "BRIDE", alias: "ha&anh" });
    for (const bad of [{ variant: "COMMON" }, { variant: "GROOM", alias: "Minh Anh&Thu Hà" }, { variant: "GROOM", projectId: PROJECT_A }, { variant: "GROOM", alias: 3 }, null, []]) {
      expect(() => parseAssignInvitationAliasCommand(bad)).toThrow(expect.objectContaining({ kind: "BAD_REQUEST" }));
    }
  });

  it("derives the default from the PUBLISHED Snapshot names in variant order (GROOM / BRIDE reversed)", async () => {
    const deps = { aliases: gateway() };
    const groom = await assignInvitationPublicAlias(PROJECT_A, { variant: "GROOM" }, staff, deps);
    const bride = await assignInvitationPublicAlias(PROJECT_A, { variant: "BRIDE" }, staff, deps);
    // Fixture names: groom "Nguyễn Minh Khôi", bride "Trần Ngọc Hân".
    expect(groom).toEqual({ variant: "GROOM", alias: "nguyen-minh-khoi&tran-ngoc-han", publicPath: "/i/nguyen-minh-khoi&tran-ngoc-han" });
    expect(bride.alias).toBe("tran-ngoc-han&nguyen-minh-khoi");
    expect(deps.aliases.getPublishedSnapshot).toHaveBeenCalledWith("client", PROJECT_A, "GROOM");
  });

  it("a Staff-chosen alternative is sent as is, without reading the Snapshot", async () => {
    const deps = { aliases: gateway() };
    const result = await assignInvitationPublicAlias(PROJECT_A, { variant: "GROOM", alias: "khoi&han" }, staff, deps);
    expect(result.alias).toBe("khoi&han");
    expect(deps.aliases.getPublishedSnapshot).not.toHaveBeenCalled();
    expect(deps.aliases.assignAlias).toHaveBeenCalledWith("client", { projectId: PROJECT_A, variant: "GROOM", alias: "khoi&han" });
  });

  it("never published → 409 NOT_PUBLISHED, no write; unusable names → 422 ALIAS_UNDERIVABLE", async () => {
    const unpublished = { aliases: gateway({ getPublishedSnapshot: vi.fn(async () => null) }) };
    await expect(assignInvitationPublicAlias(PROJECT_A, { variant: "BRIDE" }, staff, unpublished)).rejects.toMatchObject({ reason: "NOT_PUBLISHED" });
    expect(unpublished.aliases.assignAlias).not.toHaveBeenCalled();

    const base = await published("GROOM");
    const payload = structuredClone(base.payload) as { people: { groom: { name: string } } };
    payload.people.groom.name = "♥";
    const underivable = { aliases: gateway({ getPublishedSnapshot: vi.fn(async () => ({ ...base, payload })) }) };
    await expect(assignInvitationPublicAlias(PROJECT_A, { variant: "GROOM" }, staff, underivable)).rejects.toMatchObject({ reason: "ALIAS_UNDERIVABLE" });
    expect(underivable.aliases.assignAlias).not.toHaveBeenCalled();
  });

  it("a stored Snapshot of the wrong variant fails the integrity gate (no cross-variant derivation)", async () => {
    const bride = await published("BRIDE");
    const deps = { aliases: gateway({ getPublishedSnapshot: vi.fn(async () => bride) }) };
    await expect(assignInvitationPublicAlias(PROJECT_A, { variant: "GROOM" }, staff, deps)).rejects.toThrow();
    expect(deps.aliases.assignAlias).not.toHaveBeenCalled();
  });

  it("a result for another Project or variant is rejected", async () => {
    const deps = {
      aliases: gateway({
        assignAlias: vi.fn(async () => ({ invitationId: INV_GROOM, projectId: PROJECT_B, variant: "GROOM" as const, alias: "khoi&han", createdAt: "2026-10-12T00:00:00.000Z" })),
      }),
    };
    await expect(assignInvitationPublicAlias(PROJECT_A, { variant: "GROOM", alias: "khoi&han" }, staff, deps)).rejects.toThrow("does not match");
  });

  it("SQLSTATE mapping: collisions and freeze are 409 with reason + attempted alias; integrity faults stay generic", () => {
    expect(() => mapInvitationAliasRpcError("PA008", "minh-anh&thu-ha")).toThrow(expect.objectContaining({ kind: "CONFLICT", reason: "ALIAS_TAKEN", alias: "minh-anh&thu-ha" }));
    expect(() => mapInvitationAliasRpcError("PA007", "x&y")).toThrow(expect.objectContaining({ reason: "ALIAS_ALREADY_ASSIGNED" }));
    expect(() => mapInvitationAliasRpcError("PA006", "x&y")).toThrow(expect.objectContaining({ reason: "NOT_PUBLISHED" }));
    expect(() => mapInvitationAliasRpcError("PA001", "x&y")).toThrow(expect.objectContaining({ kind: "FORBIDDEN" }));
    expect(() => mapInvitationAliasRpcError("PA004", "x&y")).toThrow(expect.objectContaining({ kind: "INVARIANT" }));
    expect(() => mapInvitationAliasRpcError("PI001", "x&y")).toThrow("Failed to assign invitation alias");
    expect(() => mapInvitationAliasRpcError(undefined, "x&y")).toThrow("Failed to assign invitation alias");
  });
});

describe("POST /api/v2/internal/projects/[id]/public-aliases (handler)", () => {
  const authGateway = {
    getUser: async () => ({ id: "u" }),
  };
  it("requires a bearer token before reading the body", async () => {
    const readBody = vi.fn();
    const res = await handleAssignInvitationAliasRequest(null, PROJECT_A, readBody, authGateway as never, { aliases: gateway() });
    expect(res.status).toBe(401);
    expect(readBody).not.toHaveBeenCalled();
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("collision is 409 { reason: ALIAS_TAKEN, alias } — publication untouched (no publish dependency exists)", async () => {
    const handler = read("lib/server/routes/invitation-alias.ts");
    expect(handler).not.toMatch(/publish_invitation|publishInvitation\(/);
    const route = read("app/api/v2/internal/projects/[id]/public-aliases/route.ts");
    expect(route).toMatch(/supabaseStaffAuthGateway/);
    expect(route).not.toMatch(/service-role/);
  });
});

describe("review before write (Staff must confirm)", () => {
  it("publishing never assigns an alias; the panel sends only the exact reviewed alias after Xác nhận tạo link", () => {
    const tab = read("app/admin/v2/projects/[projectId]/_components/publish-tab.tsx").replace(/\/\/.*$/gm, "");
    expect(tab).not.toMatch(/assignInvitationPublicAlias/);
    const panel = read("app/admin/v2/projects/[projectId]/_components/public-link-panel.tsx");
    // Only the reviewed two-part alias is sent; the form submits only after the explicit confirm button.
    expect(panel).toMatch(/const alias = buildInvitationPublicAlias\(primary, secondary\);\s+if \(alias === null\) return \{ status: "INVALID" \};\s+try \{\s+await assign\(projectId, variant, alias\);/);
    expect(panel).not.toMatch(/assignInvitationPublicAlias\(projectId, link\.variant\)/);
    expect(panel).toMatch(/Xác nhận tạo link/);
    expect(panel).toMatch(/không thể sửa/);
    const readModel = read("lib/server/invitation-publish/get-project-publish-state.ts");
    expect(readModel).not.toMatch(/assignAlias|assign_invitation_public_alias/);
  });
});

describe("publish read model: public links", () => {
  const row = (variant: InvitationVariant, invitationId: string, isPublished: boolean) =>
    ({ variant, invitationId, publishedVersion: isPublished ? { id: "p" } : null }) as unknown as RequiredVariantPublishState;

  it("only published variants get a link; friendly path when assigned; canonical stays; COMMON unchanged", () => {
    const links = [
      { invitationId: INV_GROOM, variant: "GROOM" as const, publicSlug: "wc-2026-000003-groom", alias: "minh-anh&thu-ha" },
      { invitationId: INV_BRIDE, variant: "BRIDE" as const, publicSlug: "wc-2026-000003-bride", alias: null },
    ];
    expect(evaluatePublicLinks([row("GROOM", INV_GROOM, true), row("BRIDE", INV_BRIDE, true)], links)).toEqual([
      { variant: "GROOM", canonicalPath: "/i/wc-2026-000003-groom", friendlyPath: "/i/minh-anh&thu-ha", canCreateFriendlyLink: false, suggestedAlias: null },
      { variant: "BRIDE", canonicalPath: "/i/wc-2026-000003-bride", friendlyPath: null, canCreateFriendlyLink: true, suggestedAlias: null },
    ]);
    expect(evaluatePublicLinks([row("GROOM", INV_GROOM, true), row("BRIDE", INV_BRIDE, false)], links).map((l) => l.variant)).toEqual(["GROOM"]);
    expect(evaluatePublicLinks([row("COMMON", "x", true)], [{ invitationId: "x", variant: "COMMON", publicSlug: "wc-c-common", alias: null }])).toEqual([
      { variant: "COMMON", canonicalPath: "/i/wc-c-common", friendlyPath: null, canCreateFriendlyLink: false, suggestedAlias: null },
    ]);
    expect(() => evaluatePublicLinks([row("GROOM", INV_GROOM, true)], [])).toThrow();
  });

  it("repository mapper fails closed on foreign-Project or orphan alias rows", () => {
    const invitations = [{ id: INV_GROOM, project_id: PROJECT_A, variant: "GROOM", public_slug: "wc-a-groom" }];
    expect(toInvitationPublicLinks(invitations, [{ invitation_id: INV_GROOM, project_id: PROJECT_A, alias: "a&b" }], PROJECT_A)[0].alias).toBe("a&b");
    expect(() => toInvitationPublicLinks(invitations, [{ invitation_id: INV_GROOM, project_id: PROJECT_B, alias: "a&b" }], PROJECT_A)).toThrow();
    expect(() => toInvitationPublicLinks(invitations, [{ invitation_id: INV_BRIDE, project_id: PROJECT_A, alias: "a&b" }], PROJECT_A)).toThrow();
    expect(() => toInvitationPublicLinks(invitations, [{ invitation_id: INV_GROOM, project_id: PROJECT_A, alias: "A&B" }], PROJECT_A)).toThrow();
  });
});

describe("public /i/[slug] route resolution", () => {
  function aliases(map: Record<string, string>): PublicInvitationAliasGateway & { calls: string[] } {
    const calls: string[] = [];
    return { calls, resolvePublicSlug: async (alias) => (calls.push(alias), map[alias] ?? null) };
  }

  it("canonical slugs resolve to themselves without an alias read (old links unchanged)", async () => {
    const gw = aliases({});
    expect(await resolvePublicInvitationRouteSlug("wc-2026-000003-groom", gw)).toBe("wc-2026-000003-groom");
    expect(await resolvePublicInvitationRouteSlug("wc-2026-000001-common", gw)).toBe("wc-2026-000001-common");
    expect(gw.calls).toEqual([]);
  });

  it("an alias with a literal & (or %26) resolves to its own canonical slug; GROOM and BRIDE never mix", async () => {
    const gw = aliases({ "minh-anh&thu-ha": "wc-2026-000003-groom", "thu-ha&minh-anh": "wc-2026-000003-bride" });
    expect(await resolvePublicInvitationRouteSlug("minh-anh&thu-ha", gw)).toBe("wc-2026-000003-groom");
    expect(await resolvePublicInvitationRouteSlug("thu-ha&minh-anh", gw)).toBe("wc-2026-000003-bride");
    expect(await resolvePublicInvitationRouteSlug("minh-anh%26thu-ha", gw)).toBe("wc-2026-000003-groom");
  });

  it("unknown / unpublished alias, malformed segment or a malformed resolver answer → not-found, malformed never hits the DB", async () => {
    const gw = aliases({ "bad&answer": "NOT A SLUG" });
    expect(await resolvePublicInvitationRouteSlug("khong-co&ai", gw)).toBeNull();
    expect(await resolvePublicInvitationRouteSlug("bad&answer", gw)).toBeNull();
    const before = gw.calls.length;
    for (const bad of ["Minh-Anh&Thu-Ha", "minh anh&thu ha", "a&b&c", "%E0%A4%A", "x".repeat(101), "minh-ánh&thu-hà"]) {
      expect(await resolvePublicInvitationRouteSlug(bad, gw)).toBeNull();
    }
    expect(gw.calls.length).toBe(before);
  });

  it("the page renders at its own address (no redirect) and passes the CANONICAL slug to RSVP and the share cover", () => {
    const page = read("app/i/[slug]/page.tsx");
    expect(page).not.toMatch(/redirect\(|permanentRedirect\(/);
    expect(page).toMatch(/publicSlug=\{publicSlug\}/);
    expect(page).toMatch(/getSignedSocialShareCover\(publicSlug\)/);
    expect(page).toMatch(/loadPublicInvitationByRoute/);
  });

  it("personalized guest links, RSVP API and frozen renderers are not changed by this feature", () => {
    const changed = execFileSync("git", ["diff", "--name-only", "origin/weddingclick-v2", "--", "app/i/[slug]/g", "app/api/v2/public", "templates", "lib/server/public-guest", "lib/server/public-rsvp", "proxy.ts", "app/i/[slug]/public-invitation-renderer.tsx", ":!**/__tests__/**"], { cwd: ROOT, encoding: "utf8" });
    expect(changed.trim()).toBe("");
    const migrations = execFileSync("git", ["diff", "--name-only", "--diff-filter=MD", "origin/weddingclick-v2", "--", "supabase/migrations"], { cwd: ROOT, encoding: "utf8" });
    expect(migrations.trim()).toBe("");
  });
});

describe("Customer Portal prefers the friendly link", () => {
  it("maps aliases per invitation; COMMON / no alias keeps the canonical slug; foreign rows fail closed", () => {
    const rows = [
      { id: INV_GROOM, variant: "GROOM", public_slug: "wc-a-groom", published_version_id: "d0000000-0000-4000-8000-0000000000d1" },
      { id: INV_BRIDE, variant: "BRIDE", public_slug: "wc-a-bride", published_version_id: "d0000000-0000-4000-8000-0000000000d2" },
    ];
    const aliasMap = toPortalAliases([{ invitation_id: INV_GROOM, project_id: PROJECT_A, alias: "minh-anh&thu-ha" }], PROJECT_A);
    const invitations = toPortalInvitations(rows, aliasMap);
    expect(invitations.map((r) => [r.variant, r.publicAlias])).toEqual([
      ["GROOM", "minh-anh&thu-ha"],
      ["BRIDE", null],
    ]);
    expect(() => toPortalAliases([{ invitation_id: INV_GROOM, project_id: PROJECT_B, alias: "a&b" }], PROJECT_A)).toThrow();
    expect(() => toPortalAliases([{ invitation_id: INV_GROOM, project_id: PROJECT_A, alias: "wc-a-groom" }], PROJECT_A)).toThrow();
  });
});

describe("migration 0049 static review", () => {
  const sql = read(M0049).replace(/--.*$/gm, "");

  it("is additive: no ALTER/DROP of existing objects, no public_slug, snapshot or pointer writes", () => {
    expect(sql).not.toMatch(/\bDROP\b|ALTER TABLE public\.(?!invitation_public_aliases)|CREATE OR REPLACE/);
    expect(sql).not.toMatch(/UPDATE public\.|DELETE FROM public\./);
    expect(sql).not.toMatch(/public_slug\s*=|published_version_id\s*=|INSERT INTO public\.(?!invitation_public_aliases)/);
    expect(sql).not.toMatch(/log_activity/);
  });

  it("forced RLS, staff-only SELECT policy, no write grants, no USING (true)", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(1);
    expect(sql).toMatch(/FOR SELECT\s+TO authenticated\s+USING \(public\.is_staff\(\)\)/);
    expect(sql).not.toMatch(/USING \(true\)|WITH CHECK \(true\)/i);
    expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL)/);
    expect(sql).not.toMatch(/TO anon/);
  });

  it("assign is authenticated-only and self-authorizing; resolve is service_role-only; both definer + empty search_path", () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.assign_invitation_public_alias\(uuid, text, text\) TO authenticated;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.resolve_public_invitation_alias\(text\) TO service_role;/);
    expect(sql.match(/SECURITY DEFINER\s+SET search_path = ''/g)?.length).toBe(3);
    expect(sql).toMatch(/public\.is_staff\(\) IS NOT TRUE/);
    expect(sql).toMatch(/v_package_code IS DISTINCT FROM 'SEPARATE'/);
    expect(sql).toMatch(/p_variant NOT IN \('GROOM', 'BRIDE'\)/);
    expect(sql).toMatch(/version_type IS DISTINCT FROM 'PUBLISHED'/);
  });
});
