import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateProjectReviewState } from "../../invitation-review/get-project-review-state";
import type { ProjectInvitationRecord, ReviewFeedbackSummary, ReviewVersionSummary } from "../../invitation-review/invitation-review-types";
import { evaluateProjectPublishState } from "../get-project-publish-state";
import type { PublishedVersionSummary } from "../invitation-publish-types";

/**
 * Launch Hardening 04 / P0-2 — republish after PUBLISHED (owner decisions D2/D3).
 * Migration 0044 is authored, not applied; its runtime behavior was verified on a
 * disposable local Postgres replay of 0001–0044 (see the LH04 report). These tests
 * pin the authored SQL and the unchanged publish read model.
 */

const ROOT = join(__dirname, "../../../..");
const MIGRATIONS = "supabase/migrations";
const M0037 = `${MIGRATIONS}/20260911041157_0037_customer_review_feedback.sql`;
const M0044_NAME = "20260911041204_0044_republish_after_published.sql";
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const sql0044 = read(`${MIGRATIONS}/${M0044_NAME}`);
const executable = sql0044
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function createReviewVersionBlock(sql: string): string {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.create_review_version(");
  const end = sql.indexOf("COMMENT ON FUNCTION public.create_review_version");
  return sql.slice(start, end);
}

describe("migration 0044", () => {
  it("AF: is followed only by the approved 0045 (no 0046+), and no earlier migration is edited", () => {
    const names = readdirSync(join(ROOT, MIGRATIONS)).sort();
    // VH-M01 (owner-approved checkpoint maintenance): exactly the approved 0045 may follow 0044.
    expect(names.at(-1)).toBe("20260911041205_0045_project_media_portrait_couple_type.sql");
    expect(names.filter((name) => /_(004[4-9]|00[5-9]\d|0[1-9]\d\d)_/.test(name))).toEqual([M0044_NAME, "20260911041205_0045_project_media_portrait_couple_type.sql"]);
    const edited = execFileSync("git", ["diff", "--name-only", "HEAD", "--", MIGRATIONS], { cwd: ROOT, encoding: "utf8" });
    expect(edited.trim()).toBe("");
    expect(sql0044).toContain("AUTHORING ONLY — not applied.");
  });

  it("replaces exactly one function: create_review_version, same signature, no other DDL or data change", () => {
    expect(executable.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(executable).toMatch(/CREATE OR REPLACE FUNCTION public\.create_review_version\(\s*p_project_id uuid,\s*p_variant text,\s*p_expected_current_review_version_id uuid,\s*p_template_version_id uuid,\s*p_renderer_key text,\s*p_payload jsonb,\s*p_media_ids uuid\[\]\s*\)/);
    expect(executable).not.toMatch(/\b(CREATE|ALTER|DROP)\s+(TABLE|POLICY|TRIGGER|INDEX|TYPE|SCHEMA|EXTENSION|VIEW)\b/i);
    expect(executable).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|DROP FUNCTION/i);
    expect(executable).not.toMatch(/UPDATE public\.(projects|project_invitations|invitation_versions|guests|rsvps|project_access_links)\b(?![\s\S]*?WHERE p\.id = p_project_id|[\s\S]*?WHERE pi\.id = v_invitation_id)/);
  });

  it("body is 0037 verbatim except the B2 guard: COMPLETED/ARCHIVED rejected (RV010), PUBLISHED allowed", () => {
    const before = createReviewVersionBlock(read(M0037));
    const after = createReviewVersionBlock(sql0044);
    const guard037 = /  -- B2\. \[0037\][\s\S]*?IF v_project_status IN \('PUBLISHED', 'COMPLETED', 'ARCHIVED'\) THEN/;
    const guard044 = /  -- B2\. \[0044\][\s\S]*?IF v_project_status IN \('COMPLETED', 'ARCHIVED'\) THEN/;
    expect(before).toMatch(guard037);
    expect(after).toMatch(guard044);
    expect(after.replace(guard044, "<B2>")).toBe(before.replace(guard037, "<B2>"));
    expect(after).toContain("USING ERRCODE = 'RV010'");
    expect(after).not.toMatch(/'PUBLISHED', 'COMPLETED'/);
  });

  it("keeps SECURITY DEFINER, empty search_path, staff-only grants; writes no publication, payment, slug, guest, link or RSVP state", () => {
    const fn = createReviewVersionBlock(sql0044);
    expect(fn).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(fn).not.toMatch(/published_version_id\s*=|payment_status\s*=|public_slug\s*=|public\.(guests|rsvps|project_access_links)\b/);
    const sig = "public.create_review_version(uuid, text, uuid, uuid, text, jsonb, uuid[])";
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(executable).toContain(`REVOKE ALL ON FUNCTION ${sig} FROM ${role};`);
    }
    expect(executable.match(/GRANT EXECUTE ON FUNCTION/g)).toHaveLength(1);
    expect(executable).toContain(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated;`);
    expect(executable).not.toMatch(/service[-_]role[-_]key|SUPABASE_SERVICE_ROLE/i);
    // Post-condition block guards mode, search_path, guard and grants at apply time.
    expect(executable).toMatch(/DO \$\$[\s\S]*prosecdef[\s\S]*search_path=""[\s\S]*RV010 guard[\s\S]*has_function_privilege\('anon'/);
  });
});

describe("frozen republish path reused unchanged (audit D/E/F/G/I/J/K/T/U)", () => {
  it("publish_invitation (0038) appends a PUBLISHED copy under CAS and logs INVITATION_REPUBLISHED exactly once per later publish", () => {
    const sql = read(`${MIGRATIONS}/20260911041158_0038_publish_invitation.sql`);
    expect(sql).toContain("USING ERRCODE = 'PB009'");
    expect(sql).toContain("USING ERRCODE = 'PB010'");
    expect(sql).toContain("CASE WHEN v_published_id IS NULL THEN 'INVITATION_PUBLISHED' ELSE 'INVITATION_REPUBLISHED' END");
    expect(sql.match(/PERFORM public\.log_activity\(/g)).toHaveLength(2); // the publish row + PROJECT_STATUS_CHANGED
    expect(sql).not.toMatch(/SET\s+payment_status|payment_status\s*=\s*'UNPAID'/);
    const app = execFileSync("git", ["grep", "-l", "-E", "log_activity|activity_logs|INVITATION_REPUBLISHED", "--", "lib/server/invitation-publish", "lib/server/routes", "app/admin"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter((path) => path !== "" && !path.includes("__tests__") && !path.includes("activity"));
    expect(app).toEqual([]);
  });

  it("public, RSVP, share-cover and guest reads resolve published_version_id, never projects.status; slug frozen after publish", () => {
    for (const file of ["0039_public_invitation_read", "0040_submit_public_rsvp", "0041_public_social_share_cover", "0042_personalized_guest_link"]) {
      const name = readdirSync(join(ROOT, MIGRATIONS)).find((item) => item.includes(file));
      const sql = read(`${MIGRATIONS}/${name}`);
      expect(sql).toContain("published_version_id");
      expect(sql).not.toMatch(/p\.status|projects\.status|status IN \(/);
    }
    expect(read(`${MIGRATIONS}/20260911041133_0013b_complete_invitation_pointer_graph_and_media.sql`)).toContain("public_slug is frozen after first publish");
  });

  it("lifecycle 0024: AWAITING_PAYMENT -> READY_TO_PUBLISH only when PAID; a second mark-paid is refused (PL007)", () => {
    const sql = read(`${MIGRATIONS}/20260911041144_0024_project_lifecycle_payment_assignment.sql`);
    expect(sql).toContain("-- AWAITING_PAYMENT  -> READY_TO_PUBLISH   (only if payment_status = PAID)");
    expect(sql).toMatch(/IF v_payment_status = 'PAID' THEN\s*RAISE EXCEPTION[^;]*\s*USING ERRCODE = 'PL007'/);
  });
});

describe("publish read model during a post-publish correction (unchanged code)", () => {
  const PROJECT = "11111111-1111-4111-8111-111111111111";
  const invitation: ProjectInvitationRecord = { id: "i1", projectId: PROJECT, variant: "COMMON", currentReviewVersionId: "r3", publishedVersionId: "p2" };
  const reviewRow = (id: string, versionNumber: number): ReviewVersionSummary => ({
    id, invitationId: "i1", projectId: PROJECT, versionNumber, templateVersionId: "t", rendererKeySnapshot: "wedding.elegant-editorial.v1", createdAt: "2026-10-06T00:00:00.000Z",
  });
  const published: PublishedVersionSummary = {
    id: "p2", invitationId: "i1", projectId: PROJECT, versionNumber: 2, sourceReviewVersionId: "r1", templateVersionId: "t", rendererKeySnapshot: "wedding.elegant-editorial.v1", publishedAt: "2026-10-05T00:00:00.000Z",
  };
  const approval: ReviewFeedbackSummary = { id: "f1", invitationVersionId: "r3", feedbackType: "APPROVAL", message: null, createdAt: "2026-10-06T01:00:00.000Z" };

  function state(projectStatus: "CUSTOMER_REVIEW" | "APPROVED" | "READY_TO_PUBLISH", feedback: ReviewFeedbackSummary[]) {
    const reviews = [reviewRow("r3", 3), reviewRow("r1", 1)];
    const review = evaluateProjectReviewState({ projectId: PROJECT, projectStatus, packageCode: "COMMON", invitations: [invitation], currentReviews: reviews, feedback });
    return evaluateProjectPublishState({ review, paymentStatus: "PAID", invitations: [invitation], publishedVersions: [published], sourceReviews: reviews });
  }

  it("H/F: the new unapproved review is not publishable and the old publication stays reported as current", () => {
    const before = state("CUSTOMER_REVIEW", []);
    expect(before.variants[0]).toMatchObject({ canPublish: false, upToDate: false, blocker: "LIFECYCLE_NOT_READY" });
    expect(before.variants[0].publishedVersion).toMatchObject({ id: "p2", sourceReviewVersionNumber: 1 });
    expect(before.paymentStatus).toBe("PAID");
  });

  it("Y/K: after re-approval and READY_TO_PUBLISH (PAID kept), the explicit republish becomes available", () => {
    expect(state("APPROVED", [approval]).variants[0].canPublish).toBe(false);
    const ready = state("READY_TO_PUBLISH", [approval]);
    expect(ready.projectBlocker).toBeNull();
    expect(ready.variants[0]).toMatchObject({ canPublish: true, blocker: null, upToDate: false });
  });
});
