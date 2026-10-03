import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../../../../../../lib/admin/admin-api-error";
import type { ProjectReviewState } from "../../../../../../../lib/server/invitation-review/invitation-review-types";
import type { ProjectSummary } from "../../../../../../../lib/server/projects/project-types";

/** Duyệt tab: per-required-variant review state, immutable-review link, create action, BLOCKED/409 feedback; no publish. */

let queryData: ProjectReviewState | null = null;

vi.mock("../../../../../../../lib/admin/use-admin-query", () => ({
  useAdminQuery: () => ({ data: queryData, loading: false, error: null, reload: () => {} }),
}));
vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({
  fetchProjectReviewState: vi.fn(),
  createInvitationReviewVersion: vi.fn(),
  issueReviewAccessLink: vi.fn(),
}));

const { ReviewTab, createReviewErrorFeedback } = await import("../review-tab");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "f0000000-0000-4000-8000-0000000000a1";
const project = { id: PROJECT_ID, status: "INTERNAL_REVIEW" } as ProjectSummary;

describe("ReviewTab", () => {
  it("shows each required variant's current review, its immutable preview link and the create action — no publish", () => {
    queryData = {
      projectId: PROJECT_ID,
      projectStatus: "CUSTOMER_REVIEW",
      packageCode: "SEPARATE",
      requiredVariants: ["GROOM", "BRIDE"],
      allRequiredVariantsApproved: false,
      reviewOutcome: "CUSTOMER_REVIEW",
      variants: [
        {
          variant: "GROOM",
          invitationId: "a0000000-0000-4000-8000-0000000000a1",
          approved: false,
          revisionRequested: false,
          currentReview: {
            id: VERSION_ID,
            invitationId: "a0000000-0000-4000-8000-0000000000a1",
            projectId: PROJECT_ID,
            versionNumber: 2,
            templateVersionId: "t",
            rendererKeySnapshot: "r",
            createdAt: "2026-10-01T00:00:00.000Z",
            approvalState: "AWAITING_FEEDBACK",
            feedbackCount: 0,
            feedback: [],
          },
        },
        { variant: "BRIDE", invitationId: null, currentReview: null, approved: false, revisionRequested: false },
      ],
    };
    const html = renderToStaticMarkup(<ReviewTab project={project} />);
    expect(html).toContain("Nhà trai");
    expect(html).toContain("Nhà gái");
    expect(html).toContain("#2");
    expect(html).toContain(`reviewVersionId=${VERSION_ID}`);
    expect(html).toContain("Chưa có bản duyệt");
    expect(html).toContain("Tạo bản duyệt mới");
    expect(html).not.toMatch(/Xuất bản|publish/i);
    // Fresh persisted status from the read model, not the stale prop; link issuance offered once a review exists.
    expect(html).toContain("Khách đang duyệt");
    expect(html).toContain("Tạo link duyệt");
  });

  it("shows the revision outcome with the customer's message and APPROVED without implying payment/publish", () => {
    const base = queryData!;
    const groom = base.variants[0];
    queryData = {
      ...base,
      projectStatus: "REVISION_REQUIRED",
      reviewOutcome: "REVISION_REQUIRED",
      variants: [
        {
          ...groom,
          revisionRequested: true,
          currentReview: {
            ...groom.currentReview!,
            approvalState: "REVISION_REQUESTED",
            feedbackCount: 1,
            feedback: [{ id: "fb1", invitationVersionId: VERSION_ID, feedbackType: "REVISION_REQUEST", message: "Sửa giờ đón khách", createdAt: "2026-10-01T00:00:00.000Z" }],
          },
        },
        base.variants[1],
      ],
    };
    const revision = renderToStaticMarkup(<ReviewTab project={project} />);
    expect(revision).toContain("Sửa giờ đón khách");
    expect(revision).toContain("tạo bản duyệt mới");
    queryData = { ...base, projectStatus: "APPROVED", reviewOutcome: "APPROVED", allRequiredVariantsApproved: true };
    const approved = renderToStaticMarkup(<ReviewTab project={project} />);
    expect(approved).toContain("không có nghĩa là đã thanh toán hay đã xuất bản");
    expect(approved).not.toMatch(/Xuất bản thiệp|publish/i);
  });

  it("maps 422 BLOCKED to its issues and 409 to a reload message", () => {
    const issues = [{ code: "GROOM_NAME_MISSING", severity: "BLOCKING", message: "m" }];
    expect(createReviewErrorFeedback(new AdminApiError(422, "x", { error: "x", issues }))).toEqual({ kind: "BLOCKED", issues });
    const conflict = createReviewErrorFeedback(new AdminApiError(409, "raw server text"));
    expect(conflict.kind).toBe("ERROR");
    expect(JSON.stringify(conflict)).not.toContain("raw server text");
  });
});
