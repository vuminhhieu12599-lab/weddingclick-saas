import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectStatus } from "../../../../../../../lib/domain";
import type { ProjectPublishState } from "../../../../../../../lib/server/invitation-publish/invitation-publish-types";
import type { ProjectReviewState } from "../../../../../../../lib/server/invitation-review/invitation-review-types";
import type { ProjectSummary } from "../../../../../../../lib/server/projects/project-types";

/** Launch Hardening 04 / P0-2 — Duyệt / Xuất bản tab behavior for a post-publish correction. */

let reviewData: ProjectReviewState | null = null;
let publishData: ProjectPublishState | null = null;

vi.mock("../../../../../../../lib/admin/use-admin-query", () => ({
  useAdminQuery: (fetcher: () => unknown) => {
    const isPublish = String(fetcher).includes("fetchProjectPublishState");
    return { data: isPublish ? publishData : reviewData, loading: false, error: null, reload: () => {} };
  },
}));
vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({
  fetchProjectReviewState: vi.fn(),
  createInvitationReviewVersion: vi.fn(),
  issueReviewAccessLink: vi.fn(),
  fetchProjectPublishState: vi.fn(),
  publishInvitationVariant: vi.fn(),
  markProjectPaid: vi.fn(),
  transitionProjectStatus: vi.fn(),
  issuePortalAccessLink: vi.fn(),
  rotateAccessLink: vi.fn(),
  fetchProjectAccessLinks: vi.fn(),
  revokeProjectAccessLink: vi.fn(),
}));

const { ReviewTab, reviewCreationMode } = await import("../review-tab");
const { PublishTab, isPostPublishCorrection, nextPaymentStep } = await import("../publish-tab");

const ROOT = join(__dirname, "../../../../../../..");
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const project = { id: PROJECT_ID, status: "PUBLISHED" } as ProjectSummary;

function reviewState(projectStatus: ProjectStatus): ProjectReviewState {
  return {
    projectId: PROJECT_ID,
    projectStatus,
    packageCode: "COMMON",
    requiredVariants: ["COMMON"],
    allRequiredVariantsApproved: true,
    reviewOutcome: "APPROVED",
    variants: [
      {
        variant: "COMMON",
        invitationId: "i1",
        approved: true,
        revisionRequested: false,
        currentReview: {
          id: "r1", invitationId: "i1", projectId: PROJECT_ID, versionNumber: 1, templateVersionId: "t",
          rendererKeySnapshot: "wedding.elegant-editorial.v1", createdAt: "2026-10-01T00:00:00.000Z",
          approvalState: "APPROVED", feedbackCount: 1, feedback: [],
        },
      },
    ],
  };
}

function publishState(projectStatus: ProjectStatus, canPublish: boolean): ProjectPublishState {
  return {
    projectId: PROJECT_ID,
    projectStatus,
    paymentStatus: "PAID",
    packageCode: "COMMON",
    requiredVariants: ["COMMON"],
    projectBlocker: canPublish ? null : "LIFECYCLE_NOT_READY",
    allRequiredVariantsPublished: false,
    variants: [
      {
        variant: "COMMON",
        invitationId: "i1",
        currentReview: { id: "r3", versionNumber: 3, createdAt: "2026-10-06T00:00:00.000Z", approvalState: canPublish ? "APPROVED" : "AWAITING_FEEDBACK" },
        publishedVersion: {
          id: "p2", invitationId: "i1", projectId: PROJECT_ID, versionNumber: 2, sourceReviewVersionId: "r1", sourceReviewVersionNumber: 1,
          templateVersionId: "t", rendererKeySnapshot: "wedding.elegant-editorial.v1", publishedAt: "2026-10-05T00:00:00.000Z",
        },
        upToDate: false,
        canPublish,
        blocker: canPublish ? null : "LIFECYCLE_NOT_READY",
      },
    ],
  };
}

describe("Duyệt tab (W/X/D)", () => {
  it("W: PUBLISHED offers an explicit “Chỉnh sửa & duyệt lại” (no auto-create) and explains the old version stays live", () => {
    expect(reviewCreationMode("PUBLISHED")).toBe("CORRECTION");
    reviewData = reviewState("PUBLISHED");
    const html = renderToStaticMarkup(<ReviewTab project={project} />);
    expect(html).toContain('data-testid="review-correction-notice"');
    expect(html).toContain("Bản đang xuất bản vẫn hiển thị cho khách mời cho đến khi bản mới được khách duyệt và xuất bản lại.");
    expect(html).toMatch(/>Chỉnh sửa &amp; duyệt lại<\/button>/);
    expect(html).not.toContain("Tạo bản duyệt mới");
    expect(html).not.toContain("Xác nhận tạo bản duyệt mới"); // confirmation is a second, explicit step
    const source = readFileSync(join(ROOT, "app/admin/v2/projects/[projectId]/_components/review-tab.tsx"), "utf8");
    expect(source).not.toMatch(/useEffect|window\.confirm/);
  });

  it("X: COMPLETED and ARCHIVED stay closed — no create action in any form", () => {
    for (const status of ["COMPLETED", "ARCHIVED"] as const) {
      expect(reviewCreationMode(status)).toBe("CLOSED");
      reviewData = reviewState(status);
      const html = renderToStaticMarkup(<ReviewTab project={{ ...project, status }} />);
      expect(html).toContain('data-testid="review-closed-notice"');
      expect(html).not.toMatch(/Tạo bản duyệt|Chỉnh sửa &amp; duyệt lại/);
    }
  });

  it("D: pre-publish statuses keep the unchanged create action", () => {
    for (const status of ["NEW", "IN_PROGRESS", "CUSTOMER_REVIEW", "REVISION_REQUIRED", "APPROVED", "READY_TO_PUBLISH"] as const) {
      expect(reviewCreationMode(status)).toBe("OPEN");
    }
    reviewData = reviewState("REVISION_REQUIRED");
    const html = renderToStaticMarkup(<ReviewTab project={{ ...project, status: "REVISION_REQUIRED" }} />);
    expect(html).toMatch(/>Tạo bản duyệt mới<\/button>/);
    expect(html).not.toMatch(/review-correction-notice|review-closed-notice|Chỉnh sửa &amp; duyệt lại/);
  });
});

describe("Xuất bản tab (Y/K/J/F)", () => {
  it("F/K/J: during the correction the live version is shown, PAID skips mark-paid, and the old version is said to stay live", () => {
    publishData = publishState("AWAITING_PAYMENT", false);
    expect(nextPaymentStep(publishData)).toBe("TO_READY_TO_PUBLISH");
    expect(isPostPublishCorrection(publishData)).toBe(true);
    const html = renderToStaticMarkup(<PublishTab project={project} />);
    expect(html).toContain('data-testid="publish-correction-notice"');
    expect(html).toContain("Bản xuất bản hiện tại: <span class=\"font-medium\">#2</span>");
    expect(html).toContain("Chuyển sang “Sẵn sàng xuất bản”");
    expect(html).not.toContain("Xác nhận đã thanh toán");
    expect(html).not.toMatch(/Xuất bản lại từ bản duyệt/);
  });

  it("Y: at READY_TO_PUBLISH the explicit “Xuất bản lại” action appears; PUBLISHED/COMPLETED/ARCHIVED show no correction notice", () => {
    publishData = publishState("READY_TO_PUBLISH", true);
    const html = renderToStaticMarkup(<PublishTab project={project} />);
    expect(html).toMatch(/>Xuất bản lại từ bản duyệt #3<\/button>/);
    for (const status of ["PUBLISHED", "COMPLETED", "ARCHIVED"] as const) {
      expect(isPostPublishCorrection({ ...publishData, projectStatus: status })).toBe(false);
    }
    const source = readFileSync(join(ROOT, "app/admin/v2/projects/[projectId]/_components/publish-tab.tsx"), "utf8");
    expect(source).toContain("publishInvitationVariant(projectId, row.variant, review.id, published?.id ?? null)");
    expect(source.match(/publishInvitationVariant\(/g)).toHaveLength(1);
  });
});

describe("security and frozen-feature protection (Z/AA/AB/AC/AD/AE)", () => {
  it("Z/AA: changed tabs use only the internal API client — no browser Supabase, no table mutation, no service_role", () => {
    for (const file of ["review-tab.tsx", "publish-tab.tsx"]) {
      const source = readFileSync(join(ROOT, "app/admin/v2/projects/[projectId]/_components", file), "utf8");
      expect(source).not.toMatch(/@supabase\/|lib\/supabase"|\.(from|insert|update|upsert|delete|rpc)\(/);
      expect(source).not.toMatch(/service[-_]?role|SERVICE_ROLE|process\.env|console\./);
    }
  });

  it("AB–AE: server runtime, routes, public/portal/review pages, templates, 035A/035B, LH02 and LH03 runtime are byte-identical to HEAD", () => {
    const changed = execFileSync(
      "git",
      [
        "diff", "--name-only", "HEAD", "--",
        "lib", "app/api", "app/i", "app/portal", "app/review", "templates", "components", "proxy.ts", "next.config.ts",
        "package.json", "package-lock.json", "app/admin/v2/projects/new", "app/admin/v2/projects/page.tsx",
        "app/admin/v2/projects/[projectId]/_components/access-link-inventory.tsx",
        ":!**/__tests__/**",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(changed.trim()).toBe("");
  });
});
