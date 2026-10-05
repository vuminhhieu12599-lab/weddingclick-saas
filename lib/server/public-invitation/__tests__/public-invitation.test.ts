import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { buildRendererFixture } from "../../../../templates/core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_TEMPLATE_VERSION_ID } from "../../../../templates/core/fixtures/renderer-fixture-sources";
import { PRODUCTION_COMPATIBILITY_REGISTRY } from "../../../../templates/core/production-renderer-manifests";
import type { InvitationVariant } from "../../../domain";
import { extractSnapshotMediaRefs, type SnapshotPayloadV1 } from "../../../invitation-rendering";
import { toPublicInvitationRecord } from "../../supabase/public-invitation-repository";
import { loadPublicInvitation } from "../load-public-invitation";
import type { PinnedPublishedMedia, PublicInvitationRecord, PublishedInvitationMediaSigner } from "../public-invitation-types";

/**
 * Task 032A public /i/[slug]: exact current PUBLISHED Snapshot only,
 * pinned-media-only runtime signing, exact renderer binding, fail closed.
 */

const VERSION_ID = "e0000000-0000-4000-8000-0000000000b1";
const UNRELATED_MEDIA_ID = "c0000000-0000-4000-8000-0000000000ee";
const stamp = "2026-10-03T04:11:56.123456+00:00";

async function snapshotFor(variant: InvitationVariant): Promise<SnapshotPayloadV1> {
  return (await buildRendererFixture({ variant })).snapshot;
}

function pinnedFor(snapshot: SnapshotPayloadV1): PinnedPublishedMedia[] {
  return extractSnapshotMediaRefs(snapshot).map((id, index) => ({
    id,
    storageBucket: "project-media",
    storagePath: `proj/${id}.jpg`,
    width: 800 + index,
    height: 600,
  }));
}

function record(snapshot: SnapshotPayloadV1, media = pinnedFor(snapshot)): PublicInvitationRecord {
  return {
    variant: snapshot.variant,
    projectCode: snapshot.project.code,
    publishedVersion: {
      id: VERSION_ID,
      versionNumber: 4,
      templateVersionId: FIXTURE_TEMPLATE_VERSION_ID,
      rendererKey: snapshot.template.rendererKey,
      publishedAt: stamp,
      payload: snapshot,
      media,
    },
  };
}

function loadDeps(rec: PublicInvitationRecord | null) {
  const slugs: string[] = [];
  const signed: { id: string; storagePath: string }[][] = [];
  const signMedia: PublishedInvitationMediaSigner = async (media) => {
    signed.push([...media]);
    return new Map(media.map((item) => [item.id, `https://signed.test/${item.storagePath}?token=runtime`]));
  };
  return {
    slugs,
    signed,
    deps: {
      invitations: {
        async getPublicInvitation(slug: string) {
          slugs.push(slug);
          return rec;
        },
      },
      signMedia,
      rendererRegistry: PRODUCTION_COMPATIBILITY_REGISTRY.compatibility,
    },
  };
}

describe("loadPublicInvitation (/i/[slug])", () => {
  it("A/E: a published slug renders the exact persisted PUBLISHED Snapshot through its stored renderer key", async () => {
    const snapshot = await snapshotFor("GROOM");
    const { deps, slugs } = loadDeps(record(snapshot));
    const view = await loadPublicInvitation("wc-2026-000001-groom", deps);
    expect(slugs).toEqual(["wc-2026-000001-groom"]);
    expect(view).not.toBeNull();
    expect(view!.rendererKey).toBe(snapshot.template.rendererKey);
    expect(view!.viewModel.variant).toBe("GROOM");
  });

  it("B/C: unknown slug and never-published invitation (RPC null) are not-found; nothing is signed", async () => {
    const { deps, signed } = loadDeps(null);
    await expect(loadPublicInvitation("wc-2026-000001-common", deps)).resolves.toBeNull();
    expect(signed).toEqual([]);
  });

  it.each(["", "WC-2026-000001-GROOM", "../etc", "a--b", "x".repeat(101), "a b"])(
    "B: malformed slug %j is not-found without any database read",
    async (slug) => {
      const { deps, slugs } = loadDeps(null);
      await expect(loadPublicInvitation(slug, deps)).resolves.toBeNull();
      expect(slugs).toEqual([]);
    },
  );

  it("D: a stored payload that disagrees with its PUBLISHED row (renderer, template, variant) is an integrity fault", async () => {
    const snapshot = await snapshotFor("GROOM");
    const renderer = record(snapshot);
    renderer.publishedVersion.rendererKey = "wedding.other.v9";
    await expect(loadPublicInvitation("s", loadDeps(renderer).deps)).rejects.toThrow(/inconsistent/);
    const template = record(snapshot);
    template.publishedVersion.templateVersionId = "99999999-9999-4999-8999-999999999999";
    await expect(loadPublicInvitation("s", loadDeps(template).deps)).rejects.toThrow(/inconsistent/);
    const variant = { ...record(snapshot), variant: "BRIDE" as const };
    await expect(loadPublicInvitation("s", loadDeps(variant).deps)).rejects.toThrow(/inconsistent/);
  });

  it("D: a Snapshot naming another Project than the invitation is rejected", async () => {
    const snapshot = await snapshotFor("COMMON");
    const other = { ...record(snapshot), projectCode: "WC-2099-999999" };
    await expect(loadPublicInvitation("s", loadDeps(other).deps)).rejects.toThrow(/different Project/);
  });

  it("F: an unregistered renderer key fails closed (no fallback)", async () => {
    const snapshot = await snapshotFor("COMMON");
    const unknown = structuredClone(snapshot);
    unknown.template.rendererKey = "wedding.unknown.v1";
    const rec = record(unknown);
    await expect(loadPublicInvitation("s", loadDeps(rec).deps)).rejects.toMatchObject({ code: "RENDERER_KEY_NOT_REGISTERED" });
  });

  it("G/H/I: signs ONLY media pinned to the PUBLISHED version and referenced by its Snapshot; nothing else is looked up", async () => {
    const snapshot = await snapshotFor("GROOM");
    const pinned = pinnedFor(snapshot);
    expect(pinned.length).toBeGreaterThan(1);
    const [notPinned, foreignBucket, ...rest] = pinned;
    const media = [
      ...rest,
      { ...foreignBucket, storageBucket: "other-bucket" },
      { id: UNRELATED_MEDIA_ID, storageBucket: "project-media", storagePath: "proj/unrelated.jpg", width: null, height: null },
    ];
    const { deps, signed } = loadDeps(record(snapshot, media));
    const view = await loadPublicInvitation("s", deps);
    expect(signed).toHaveLength(1);
    const signedIds = signed[0].map((item) => item.id).sort();
    expect(signedIds).toEqual(rest.map((row) => row.id).sort());
    const vmJson = JSON.stringify(view!.viewModel);
    expect(vmJson).not.toContain("unrelated.jpg");
    expect(vmJson).not.toContain(`${notPinned.id}.jpg`);
  });

  it("J: signed URLs are runtime-only: present in the ViewModel, never written into the persisted payload", async () => {
    const snapshot = await snapshotFor("BRIDE");
    const before = JSON.stringify(snapshot);
    const rec = record(snapshot);
    const view = await loadPublicInvitation("s", loadDeps(rec).deps);
    expect(JSON.stringify(view!.viewModel)).toContain("token=runtime");
    expect(JSON.stringify(rec.publishedVersion.payload)).toBe(before);
    expect(before).not.toMatch(/signed|token=/);
  });

  it("media signing failure propagates (safe error page), never a partial silent render", async () => {
    const snapshot = await snapshotFor("GROOM");
    const { deps } = loadDeps(record(snapshot));
    deps.signMedia = async () => {
      throw new Error("Failed to sign published invitation media URLs");
    };
    await expect(loadPublicInvitation("s", deps)).rejects.toThrow(/sign/);
  });

  it.each(["COMMON", "GROOM", "BRIDE"] as const)("K: a %s slug renders its own invitation's variant only", async (variant) => {
    const snapshot = await snapshotFor(variant);
    const view = await loadPublicInvitation(`wc-2026-000001-${variant.toLowerCase()}`, loadDeps(record(snapshot)).deps);
    expect(view!.viewModel.variant).toBe(variant);
  });
});

describe("toPublicInvitationRecord (0039 result shape)", () => {
  it("null → null; malformed shapes fail closed", () => {
    expect(toPublicInvitationRecord(null)).toBeNull();
    expect(() => toPublicInvitationRecord({ variant: "OTHER", projectCode: "x", publishedVersion: {} })).toThrow(/shape/);
    expect(() =>
      toPublicInvitationRecord({ variant: "GROOM", projectCode: "WC", publishedVersion: { id: VERSION_ID, media: [] } }),
    ).toThrow(/shape/);
  });
});

// ---------------------------------------------------------------------------
// Static containment / route / migration contract
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGE = "app/i/[slug]/page.tsx";
const WIRING = "lib/server/public-invitation/public-invitation-supabase.ts";
const USE_CASE = "lib/server/public-invitation/load-public-invitation.ts";
const REPOSITORY = "lib/server/supabase/public-invitation-repository.ts";
const SIGNER = "lib/server/supabase/published-invitation-media-signer.ts";
const MIGRATION = "supabase/migrations/20260911041159_0039_public_invitation_read.sql";

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
const importersOf = (moduleName: string) =>
  PRODUCTION.filter((file) => new RegExp(`from\\s+["'][^"']*/${moduleName}["']`).test(read(file)));

describe("service_role containment + public route (Task 032A)", () => {
  it("L: repository and signer are imported only by the wiring; the wiring only by /i/[slug]", () => {
    expect(importersOf("public-invitation-repository")).toEqual([WIRING]);
    expect(importersOf("published-invitation-media-signer")).toEqual([WIRING]);
    expect(importersOf("public-invitation-supabase")).toEqual([PAGE]);
  });

  it("L: the page is a Server Component that never imports service-role-client and renders through the production host", () => {
    const page = read(PAGE);
    expect(page).not.toMatch(/^["']use client["']/m);
    expect(page).not.toMatch(/service-role-client|SUPABASE_SERVICE_ROLE_KEY|createServiceRole/);
    expect(page).toMatch(/<InvitationRendererHost /);
    expect(page).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("the signer only batch-signs in project-media; the repository calls only get_public_invitation", () => {
    const signer = strip(read(SIGNER));
    expect(signer).toMatch(/\.storage\s*\.from\(PROJECT_MEDIA_BUCKET\)\s*\.createSignedUrls\(/);
    expect(signer).not.toMatch(/\.rpc\(|\.list\(|\.upload\(|\.remove\(|\.move\(|\.copy\(|\.createSignedUploadUrl\(|\.from\(["']/);
    const repository = strip(read(REPOSITORY));
    expect([...repository.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1])).toEqual(["get_public_invitation"]);
    expect(repository).not.toMatch(/\.from\(|\.storage\b/);
  });

  it("M/N: the public path never loads/rebuilds the draft, never reads REVIEW pointers, never writes RSVP or supplies an RSVP capability", () => {
    const code = [PAGE, WIRING, USE_CASE, REPOSITORY, SIGNER, "lib/server/public-invitation/public-invitation-types.ts"]
      .map((f) => strip(read(f)))
      .join("\n");
    expect(code).not.toMatch(/buildSnapshotPayload|loadSnapshotPayloadInput|loadStaffDraftSnapshot|current_review_version_id|getCustomerReview/);
    expect(code).not.toMatch(/rsvps|RsvpCapabilityV1|rsvp=|StaffPreviewRenderer|guest_token|openGraph|searchParams/i);
    expect(code).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("O: no template, music or opening module imports the public invitation path", () => {
    for (const file of PRODUCTION.filter((f) => f.startsWith("templates/"))) {
      expect(read(file), file).not.toMatch(/public-invitation|published-invitation-media-signer/);
    }
  });
});

describe("migration 0039 contract", () => {
  const sql = read(MIGRATION);
  const executable = sql.replace(/--.*$/gm, "");

  it("one STABLE SECURITY DEFINER function with an empty search_path, EXECUTE for service_role only, no table grant", () => {
    expect(executable.match(/CREATE (?:OR REPLACE )?FUNCTION/g)).toHaveLength(1);
    expect(executable).toMatch(/STABLE\s+SECURITY DEFINER\s+SET search_path = ''/);
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(executable).toContain(`REVOKE ALL ON FUNCTION public.get_public_invitation(text) FROM ${role};`);
    }
    expect(executable.match(/\bGRANT\b[^;]*;/g)).toEqual(["GRANT EXECUTE ON FUNCTION public.get_public_invitation(text) TO service_role;"]);
    expect(executable).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b|ALTER TABLE|CREATE POLICY|log_activity/);
  });

  it("C/D/G/I: resolves only published_version_id as a PUBLISHED row of the same invitation + Project, with only its own pins", () => {
    expect(executable).toMatch(/WHERE pi\.public_slug = p_public_slug/);
    expect(executable).toMatch(/IF NOT FOUND OR v_published_id IS NULL THEN\s+RETURN NULL;/);
    expect(executable).toMatch(/WHERE iv\.id = v_published_id/);
    expect(executable).toMatch(/version_type IS DISTINCT FROM 'PUBLISHED'/);
    expect(executable).toMatch(/invitation_id IS DISTINCT FROM v_invitation_id/);
    expect(executable).toMatch(/project_id IS DISTINCT FROM v_project_id/);
    expect(executable).toMatch(/WHERE ivm\.invitation_version_id = v_version\.id\s+AND ivm\.project_id = v_project_id/);
    expect(executable).not.toMatch(/current_review_version_id|'REVIEW'|review_feedback|wedding_details|payment_status|source_review_version_id/);
  });
});
