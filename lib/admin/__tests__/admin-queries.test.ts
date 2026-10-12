import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../staff-session-client", () => ({ getStaffAccessToken: async () => "jwt" }));
vi.mock("../signed-media-upload", () => ({ uploadToSignedMediaPath: vi.fn() }));

const { adminQueries } = await import("../admin-queries");

/**
 * LAUNCH-P0-03: every reusable query key contains every id its fetcher
 * reads, keys never collide, and customer-driven / signed-URL reads are not
 * reusable.
 */

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const ROOT = join(__dirname, "../../..");

describe("adminQueries", () => {
  it("project-scoped keys contain the projectId and differ between Projects", () => {
    const projectScoped = [
      adminQueries.projectSummary,
      adminQueries.designAndCatalog,
      adminQueries.requiredInvitationData,
      adminQueries.weddingDetails,
      adminQueries.editorReadiness,
      adminQueries.media,
      adminQueries.timeline,
      adminQueries.dressCode,
      adminQueries.tasks,
    ];
    for (const define of projectScoped) {
      expect(define(P1).key).toContain(P1);
      expect(define(P1).key).not.toBe(define(P2).key);
    }
    expect(adminQueries.customer(P1).key).toContain(P1);
  });

  it("all keys are distinct", () => {
    const keys = [
      adminQueries.dashboard().key,
      adminQueries.projects().key,
      adminQueries.projects(5).key,
      adminQueries.customer(P1).key,
      ...[
        adminQueries.projectSummary,
        adminQueries.designAndCatalog,
        adminQueries.requiredInvitationData,
        adminQueries.weddingDetails,
        adminQueries.editorReadiness,
        adminQueries.media,
        adminQueries.timeline,
        adminQueries.dressCode,
        adminQueries.tasks,
      ].map((define) => define(P1).key),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Review, Publish, Activity, access links, previews and signed-URL reads are never reusable", () => {
    const source = readFileSync(join(ROOT, "lib/admin/admin-queries.ts"), "utf8").replace(/\/\*\*[\s\S]*?\*\//g, "");
    expect(source).not.toMatch(
      /fetchProjectReviewState|fetchProjectPublishState|fetchProjectActivity|fetchProjectAccessLinks|fetchStaffInvitationPreview|fetchReviewVersionPreview|fetchPhotoLibrary|fetchTemplateMediaSlots|fetchStaffMe/,
    );
    for (const file of [
      "app/admin/v2/projects/[projectId]/_components/review-tab.tsx",
      "app/admin/v2/projects/[projectId]/_components/publish-tab.tsx",
      "app/admin/v2/projects/[projectId]/_components/activity-tab.tsx",
      "app/admin/v2/projects/[projectId]/_components/template-media-slot-editor.tsx",
      "app/admin/v2/projects/[projectId]/preview/page.tsx",
    ]) {
      expect(readFileSync(join(ROOT, file), "utf8")).not.toContain("cacheKey");
    }
  });

  it("reads made just before a save stay direct network reads (never a reused result)", () => {
    for (const file of ["family-editor.tsx", "gift-content-editor.tsx", "required-invitation-data.tsx"]) {
      const source = readFileSync(join(ROOT, "app/admin/v2/projects/[projectId]/_components", file), "utf8");
      expect(source).toMatch(/await fetchWeddingDetails\(projectId\)/);
    }
  });
});
