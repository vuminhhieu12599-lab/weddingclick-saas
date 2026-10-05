import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { requiredInvitationVariantsForPackage, SERVICE_PACKAGE_CODES } from "../../../domain";
import type { StaffAuthGateway } from "../../auth/staff-context";
import type { PublishedInvitationVersion } from "../../invitation-publish/invitation-publish-types";
import type { PublishInvitationDependencies } from "../../invitation-publish/publish-invitation";
import { PublishConflictError } from "../../invitation-publish/publish-rpc-error-codes";

/**
 * Task 031 staff publish HTTP boundary + static security contract for
 * migration 0038: staff auth before the body is read, 201 only on a
 * created version, 409 with a stable reason, copy-on-publish from the
 * approved REVIEW (no caller payload), CAS + locks, aggregate PUBLISHED,
 * staff-only grant, no service_role, no public route, no RSVP.
 */

const publishSpy = vi.fn<(...args: unknown[]) => Promise<PublishedInvitationVersion>>();

vi.mock("../../invitation-publish/publish-invitation", async (importActual) => {
  const actual = await importActual<typeof import("../../invitation-publish/publish-invitation")>();
  return { ...actual, publishInvitation: (...args: unknown[]) => publishSpy(...args) };
});

const { handlePublishInvitationRequest } = await import("../invitation-publish");

function authGateway(profile: { role: string; displayName: string } | null): StaffAuthGateway<string> {
  return {
    createClient: (token) => `client-for-${token}`,
    getAuthenticatedUserId: async () => "staff-1",
    getActiveStaffProfile: async () => profile,
  };
}
const deps = {} as PublishInvitationDependencies<string>;
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const staffGateway = authGateway({ role: "STAFF", displayName: "S" });

describe("POST publish handler", () => {
  it.each([
    ["no bearer", null, staffGateway, 401],
    ["non-staff", "Bearer t", authGateway(null), 403],
  ])("%s → %d before the body is read or anything is written", async (_label, header, gateway, status) => {
    publishSpy.mockReset();
    const readBody = vi.fn(async () => ({}));
    const result = await handlePublishInvitationRequest(header, PROJECT_ID, readBody, gateway, deps);
    expect(result.status).toBe(status);
    expect(readBody).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
    expect(result.headers["Cache-Control"]).toBe("no-store");
  });

  it("201 with the created version, staff-scoped client; 409 carries the stable reason; malformed JSON → 400; unknown → generic 500", async () => {
    const version = { id: "v", versionNumber: 3 } as PublishedInvitationVersion;
    publishSpy.mockResolvedValueOnce(version);
    const created = await handlePublishInvitationRequest("Bearer t", PROJECT_ID, async () => ({ variant: "COMMON" }), staffGateway, deps);
    expect(created).toMatchObject({ status: 201, body: { data: version } });
    expect(publishSpy.mock.calls[0][2]).toMatchObject({ supabase: "client-for-t" });

    publishSpy.mockRejectedValueOnce(new PublishConflictError("Project payment is not confirmed", "PAYMENT_NOT_READY"));
    const conflict = await handlePublishInvitationRequest("Bearer t", PROJECT_ID, async () => ({}), staffGateway, deps);
    expect(conflict).toMatchObject({ status: 409, body: { reason: "PAYMENT_NOT_READY" } });

    const malformed = await handlePublishInvitationRequest("Bearer t", PROJECT_ID, async () => {
      throw new SyntaxError("bad json");
    }, staffGateway, deps);
    expect(malformed.status).toBe(400);

    publishSpy.mockRejectedValueOnce(new Error("db detail: relation ..."));
    const failed = await handlePublishInvitationRequest("Bearer t", PROJECT_ID, async () => ({}), staffGateway, deps);
    expect(failed).toEqual({ status: 500, body: { error: "Internal server error" }, headers: { "Cache-Control": "no-store" } });
  });
});

describe("Task 031 static security contract (migration 0038)", () => {
  const root = join(__dirname, "..", "..", "..", "..");
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/--.*$/gm, "");
  const migration = readFileSync(join(root, "supabase", "migrations", "20260911041158_0038_publish_invitation.sql"), "utf8");
  const sql = strip(migration).split("COMMENT ON FUNCTION")[0];

  it("the DB variant policy equals the TypeScript policy for every package code", () => {
    for (const code of SERVICE_PACKAGE_CODES) {
      const list = requiredInvitationVariantsForPackage(code)!.map((v) => `'${v}'`).join(", ");
      expect(sql).toContain(`WHEN '${code}' THEN ARRAY[${list}]::text[]`);
    }
    expect(sql).toMatch(/ELSE NULL/);
  });

  it("the caller supplies only CAS tokens: no payload/renderer/template/media/status parameter", () => {
    const signature = sql.match(/CREATE FUNCTION public\.publish_invitation\(([\s\S]*?)\)\s*RETURNS/)![1];
    expect(signature.replace(/\s+/g, " ").trim()).toBe(
      "p_project_id uuid, p_variant text, p_expected_current_review_version_id uuid, p_expected_published_version_id uuid",
    );
  });

  it("copy-on-publish: PUBLISHED row is INSERT … SELECT from the exact REVIEW row, media pins copied from that REVIEW", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.invitation_versions \([\s\S]*source_review_version_id, template_version_id, renderer_key_snapshot,\s*payload[\s\S]*SELECT[\s\S]*'PUBLISHED',\s*src\.id, src\.template_version_id, src\.renderer_key_snapshot,\s*src\.payload[\s\S]*FROM public\.invitation_versions AS src\s*WHERE src\.id = v_review\.id/,
    );
    expect(sql).toMatch(
      /INSERT INTO public\.invitation_version_media[\s\S]*SELECT v_result\.id, ivm\.project_media_id, ivm\.project_id\s*FROM public\.invitation_version_media AS ivm\s*WHERE ivm\.invitation_version_id = v_review\.id/,
    );
    expect(sql).not.toMatch(/wedding_details|project_events|project_media AS|project_design|signedUrl|storage/i);
  });

  it("lifecycle, approval, CAS and locking are enforced before any write", () => {
    const firstWrite = sql.indexOf("INSERT INTO public.invitation_versions");
    const guards = [
      "FOR NO KEY UPDATE",
      "'PUBLISHED', 'COMPLETED', 'ARCHIVED'",
      "v_payment_status IS DISTINCT FROM 'PAID'",
      "v_status IS DISTINCT FROM 'READY_TO_PUBLISH'",
      "FOR UPDATE",
      "v_current_review_id IS DISTINCT FROM p_expected_current_review_version_id",
      "v_published_id IS DISTINCT FROM p_expected_published_version_id",
      "rf.feedback_type = 'APPROVAL'",
      "rf.feedback_type = 'REVISION_REQUEST'",
      "review_outcome_for_project(p_project_id) IS DISTINCT FROM 'APPROVED'",
      "v_published_source_id IS NOT DISTINCT FROM v_review.id",
    ];
    for (const guard of guards) {
      const at = sql.indexOf(guard);
      expect(at, guard).toBeGreaterThan(-1);
      expect(at, guard).toBeLessThan(firstWrite);
    }
  });

  it("immutability + status: no version UPDATE/DELETE, pointer advanced after insert+pins, PUBLISHED only via the aggregate, payment untouched", () => {
    expect(sql).not.toMatch(/UPDATE public\.invitation_versions|DELETE FROM|current_review_version_id\s*=\s*v_/);
    expect(sql).not.toMatch(/payment_status\s*=|paid_at|READY_TO_PUBLISH'\s*WHERE|status = 'READY_TO_PUBLISH'/);
    const insertAt = sql.indexOf("INSERT INTO public.invitation_versions");
    const pinsAt = sql.indexOf("INSERT INTO public.invitation_version_media");
    const pointerAt = sql.indexOf("published_version_id = v_result.id");
    expect(insertAt).toBeLessThan(pinsAt);
    expect(pinsAt).toBeLessThan(pointerAt);
    const statusWrite = sql.indexOf("status = 'PUBLISHED'");
    expect(statusWrite).toBeGreaterThan(sql.indexOf("IF v_fully_published THEN"));
    expect(sql).toMatch(/pv\.source_review_version_id IS DISTINCT FROM pi\.current_review_version_id/);
    expect(sql).toMatch(/max\(iv\.version_number\), 0\) \+ 1/);
  });

  it("SECURITY DEFINER with empty search_path, self-authorizing, EXECUTE for authenticated only", () => {
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(sql).toMatch(/public\.is_staff\(\) IS NOT TRUE/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.publish_invitation\(uuid, text, uuid, uuid\) TO authenticated;/);
    expect(sql).not.toMatch(/TO (anon|service_role|PUBLIC)\s*;/i);
    expect(sql.match(/CREATE (OR REPLACE )?FUNCTION/g)).toHaveLength(1);
    expect(sql).not.toMatch(/ALTER TABLE|CREATE TABLE|DROP /);
  });

  it("publish modules/routes use no service_role, no direct table writes; no public invitation route, no RSVP/guest/OG", () => {
    const files = [
      join(root, "lib", "server", "supabase", "invitation-publish-repository.ts"),
      join(root, "lib", "server", "routes", "invitation-publish.ts"),
      join(root, "app", "api", "v2", "internal", "projects", "[id]", "publish", "route.ts"),
      join(root, "app", "admin", "v2", "projects", "[projectId]", "_components", "publish-tab.tsx"),
    ];
    for (const entry of readdirSync(join(root, "lib", "server", "invitation-publish"), { withFileTypes: true })) {
      if (entry.isFile()) files.push(join(root, "lib", "server", "invitation-publish", entry.name));
    }
    const code = files.map((file) => strip(readFileSync(file, "utf8"))).join("\n");
    expect(code).not.toMatch(/service[_-]?role|SERVICE_ROLE|createServiceRole/i);
    expect(code).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(code).not.toMatch(/rsvps|guest_token|openGraph|SOCIAL_SHARE_COVER|loadStaffDraftSnapshot|buildSnapshotPayload/);
    // Task 032A now owns app/i/[slug] (public PUBLISHED rendering only).
  });
});
