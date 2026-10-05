import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Task 032B — /i/[slug] Open Graph metadata from the CURRENT effective
 * SOCIAL_SHARE_COVER (never COVER), runtime-signed, always noindex.
 */

const calls: { kind: string; args: unknown[] }[] = [];
let rpcResult: { data: unknown; error: { code: string; message: string } | null } = { data: null, error: null };
let signResult: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock("../../supabase/service-role-client", () => ({
  createServiceRoleSupabaseClient: () => ({
    rpc: async (...args: unknown[]) => (calls.push({ kind: "rpc", args }), rpcResult),
    from: (...args: unknown[]) => {
      calls.push({ kind: "from", args });
      throw new Error("table access is not allowed");
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (...args: unknown[]) => (calls.push({ kind: "sign", args: [bucket, ...args] }), signResult),
      }),
    },
  }),
}));

const { buildPublicInvitationMetadata, PUBLIC_INVITATION_GENERIC_TITLE } = await import("../public-invitation-metadata");
const { getServiceRolePublicSocialShareCoverGateway, toSocialShareCoverReference } = await import(
  "../../supabase/public-social-share-repository"
);
const { buildRendererFixture } = await import("../../../../templates/core/fixtures/renderer-fixture-pipeline");

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const strip = (source: string) =>
  source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
    .join("\n");

const SLUG = "wc-2026-000001-groom";
const SIGNED = "https://example.supabase.co/storage/v1/object/sign/project-media/p/share.jpg?token=runtime";
const cover = (overrides: Record<string, unknown> = {}) => ({
  cover: { storageBucket: "project-media", storagePath: "p/share.jpg", mimeType: "image/jpeg", width: 1200, height: 630, altText: "Ảnh chia sẻ", ...overrides },
});

beforeEach(() => {
  calls.length = 0;
  rpcResult = { data: null, error: null };
  signResult = { data: { signedUrl: SIGNED }, error: null };
});

describe("metadata builder (A–D, H, I, L)", () => {
  it.each(["GROOM", "BRIDE"] as const)("A/L %s: title in canonical primary → secondary order, OG basics, noindex", async (variant) => {
    const { viewModel } = await buildRendererFixture({ variant });
    const meta = buildPublicInvitationMetadata(viewModel, null);
    const title = `${viewModel.people.primary.name} & ${viewModel.people.secondary.name} — Thiệp cưới`;
    expect(meta.title).toBe(title);
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.openGraph).toMatchObject({ type: "website", title, locale: "vi_VN" });
    expect(meta.description).toBeTruthy();
    expect(JSON.stringify(meta)).not.toMatch(/"url"/);
  });

  it("B/H: the signed SOCIAL_SHARE_COVER becomes og:image with stored dimensions and alt", async () => {
    const { viewModel } = await buildRendererFixture({ variant: "COMMON" });
    const meta = buildPublicInvitationMetadata(viewModel, { url: SIGNED, width: 1200, height: 630, altText: "Ảnh chia sẻ" });
    expect((meta.openGraph as { images: unknown }).images).toEqual([{ url: SIGNED, width: 1200, height: 630, alt: "Ảnh chia sẻ" }]);
  });

  it("I: legacy NULL dimensions → image without invented width/height; alt falls back to the title", async () => {
    const { viewModel } = await buildRendererFixture({ variant: "COMMON" });
    const meta = buildPublicInvitationMetadata(viewModel, { url: SIGNED, width: null, height: null, altText: null });
    expect((meta.openGraph as { images: unknown }).images).toEqual([{ url: SIGNED, alt: meta.title }]);
  });

  it("C/D: no SOCIAL_SHARE_COVER → no og:image at all (no COVER fallback)", async () => {
    const { viewModel } = await buildRendererFixture({ variant: "COMMON" });
    const meta = buildPublicInvitationMetadata(viewModel, null);
    expect(meta.openGraph).not.toHaveProperty("images");
    expect(JSON.stringify(meta)).not.toMatch(/https?:/);
  });

  it("F: unknown/unpublished/failed invitation → generic title only, noindex, no project data", () => {
    expect(buildPublicInvitationMetadata(null, null)).toEqual({ title: PUBLIC_INVITATION_GENERIC_TITLE, robots: { index: false, follow: false } });
  });
});

describe("RPC result parsing (C, E, image-only)", () => {
  it("unknown slug → null; no cover chosen → null; valid → exact reference", () => {
    expect(toSocialShareCoverReference(null)).toBeNull();
    expect(toSocialShareCoverReference({ cover: null })).toBeNull();
    expect(toSocialShareCoverReference(cover())).toEqual({ storagePath: "p/share.jpg", width: 1200, height: 630, altText: "Ảnh chia sẻ" });
  });

  it.each([
    ["non-image mime", { mimeType: "audio/mpeg" }],
    ["other bucket", { storageBucket: "other-bucket" }],
  ])("%s → null (not used, no fallback)", (_label, overrides) => {
    expect(toSocialShareCoverReference(cover(overrides))).toBeNull();
  });

  it("legacy NULL mime and NULL dimensions are accepted; blank alt is dropped", () => {
    expect(toSocialShareCoverReference(cover({ mimeType: null, width: null, height: null, altText: "  " }))).toEqual({
      storagePath: "p/share.jpg",
      width: null,
      height: null,
      altText: null,
    });
  });

  it.each([[{}], [{ cover: { storagePath: "" } }], [{ cover: { ...cover().cover, width: 0 } }], ["x"]])("malformed %j → throws", (data) => {
    expect(() => toSocialShareCoverReference(data)).toThrow();
  });
});

describe("gateway (G, J): signs exactly the one returned object, runtime only", () => {
  it("calls only get_public_social_share_cover, then signs exactly that path for 1 hour", async () => {
    rpcResult = { data: cover(), error: null };
    const result = await getServiceRolePublicSocialShareCoverGateway().getSignedSocialShareCover(SLUG);
    expect(result).toEqual({ url: SIGNED, width: 1200, height: 630, altText: "Ảnh chia sẻ" });
    expect(calls).toEqual([
      { kind: "rpc", args: ["get_public_social_share_cover", { p_public_slug: SLUG }] },
      { kind: "sign", args: ["project-media", "p/share.jpg", 3600] },
    ]);
  });

  it("no cover / unpublished → null and nothing is signed", async () => {
    for (const data of [null, { cover: null }]) {
      rpcResult = { data, error: null };
      expect(await getServiceRolePublicSocialShareCoverGateway().getSignedSocialShareCover(SLUG)).toBeNull();
    }
    expect(calls.filter((c) => c.kind === "sign")).toHaveLength(0);
  });

  it("RPC or signing failure → generic error without database detail", async () => {
    rpcResult = { data: null, error: { code: "PI001", message: "Published version pointer integrity fault" } };
    await expect(getServiceRolePublicSocialShareCoverGateway().getSignedSocialShareCover(SLUG)).rejects.toThrow(/^Failed to load social share cover$/);
    rpcResult = { data: cover(), error: null };
    signResult = { data: null, error: { message: "Object not found" } };
    await expect(getServiceRolePublicSocialShareCoverGateway().getSignedSocialShareCover(SLUG)).rejects.toThrow(/^Failed to sign social share cover$/);
  });
});

describe("migration 0041 (E, F, security)", () => {
  const dir = join(ROOT, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.includes("_0041_"));
  const code = files.length === 1 ? readFileSync(join(dir, files[0]), "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n") : "";

  it("one read-only service_role-only SECURITY DEFINER function with empty search_path and no grants/policies", () => {
    expect(files).toHaveLength(1);
    expect(code).toMatch(/STABLE\s+SECURITY DEFINER\s+SET search_path = ''/);
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION public.get_public_social_share_cover(text) FROM ${role};`);
    }
    expect(code.match(/GRANT [A-Z]+ ON/g)).toEqual(["GRANT EXECUTE ON"]);
    expect(code).not.toMatch(/INSERT|UPDATE |DELETE|CREATE POLICY|ALTER TABLE|DROP /i);
  });

  it("requires the current PUBLISHED version and returns only the effective SOCIAL_SHARE_COVER (sort_order, id), never COVER", () => {
    expect(code).toMatch(/v_published_id IS NULL THEN\s+RETURN NULL/);
    expect(code).toMatch(/version_type IS DISTINCT FROM 'PUBLISHED'/);
    expect(code).toMatch(/pm\.project_id = v_project_id\s+AND pm\.media_type = 'SOCIAL_SHARE_COVER'\s+ORDER BY pm\.sort_order, pm\.id\s+LIMIT 1/);
    expect(code).not.toMatch(/'COVER'|payload|current_review_version_id|invitation_version_media|wedding_details/);
  });
});

describe("containment (G, J, K, M, N)", () => {
  const PAGE = "app/i/[slug]/page.tsx";
  const REPOSITORY = "lib/server/supabase/public-social-share-repository.ts";
  const WIRING = "lib/server/public-invitation/public-social-share-supabase.ts";

  function sources(dir: string): string[] {
    return readdirSync(join(ROOT, dir)).flatMap((entry) => {
      const abs = join(ROOT, dir, entry);
      if (entry === "__tests__" || entry === "node_modules") return [];
      if (statSync(abs).isDirectory()) return sources(relative(ROOT, abs));
      return /\.tsx?$/.test(entry) ? [relative(ROOT, abs)] : [];
    });
  }
  const production = [...sources("lib"), ...sources("app"), ...sources("templates")];
  const importersOf = (name: string) => production.filter((f) => new RegExp(`from\\s+["'][^"']*/${name}["']`).test(read(f)));

  it("repository → wiring → page only; repository does only the 0041 RPC + one createSignedUrl", () => {
    expect(importersOf("public-social-share-repository")).toEqual([WIRING]);
    expect(importersOf("public-social-share-supabase")).toEqual([PAGE]);
    const repo = strip(read(REPOSITORY));
    expect([...repo.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1])).toEqual(["get_public_social_share_cover"]);
    expect(repo).not.toMatch(/\.from\(["']|createSignedUrls|\.list\(|\.upload\(|\.remove\(|\.move\(|\.copy\(|console\./);
  });

  it("SOCIAL_SHARE_COVER never enters Snapshot/ViewModel/renderers; no client or template code reaches the social path", () => {
    for (const file of production.filter((f) => f.startsWith("templates/") || f.startsWith("lib/invitation-rendering/"))) {
      expect(read(file), file).not.toMatch(/public-social-share|public-invitation-metadata/);
    }
    for (const file of production.filter((f) => /^["']use client["']/.test(read(f)))) {
      expect(read(file), file).not.toMatch(/public-social-share|service-role-client|SUPABASE_SERVICE_ROLE_KEY/);
    }
  });

  it("the page stays dynamic, renders through the unchanged public RSVP wrapper and loads only through the 032A use case", () => {
    const page = read(PAGE);
    expect(page).toMatch(/export const dynamic = "force-dynamic"/);
    expect(page).toMatch(/<PublicInvitationRenderer\s+publicSlug=\{slug\}/);
    expect(page).toMatch(/cache\(\(slug: string\) => loadPublicInvitation\(slug, createPublicInvitationPageDependencies\(\)\)\)/);
    expect(page).not.toMatch(/service-role-client|openGraph|searchParams|headers\(/);
  });
});
