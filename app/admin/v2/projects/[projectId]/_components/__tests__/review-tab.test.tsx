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
  confirmReviewApprovalOnBehalf: vi.fn(),
}));

const { ReviewTab, createReviewErrorFeedback, confirmApprovalErrorFeedback } = await import("../review-tab");

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
            feedback: [{ id: "fb1", invitationVersionId: VERSION_ID, feedbackType: "REVISION_REQUEST", message: "Sửa giờ đón khách", createdAt: "2026-10-01T00:00:00.000Z", actorType: "CUSTOMER", approvalChannel: null, staffNote: null }],
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

  /** TE-06: the action is offered for the current review only while it still awaits a decision. */
  it("offers staff approval on behalf for an undecided current review, and never for a decided one", () => {
    const base = queryData!;
    const groom = base.variants[0];
    const awaiting = renderToStaticMarkup(<ReviewTab project={project} />);
    expect(awaiting).toContain("Xác nhận thay khách hàng");
    expect(awaiting).toContain("qua Zalo, điện thoại hoặc gặp trực tiếp");

    // Already approved on this version: no second decision is offered.
    queryData = {
      ...base,
      variants: [
        { ...groom, approved: true, currentReview: { ...groom.currentReview!, approvalState: "APPROVED" } },
        base.variants[1],
      ],
    };
    expect(renderToStaticMarkup(<ReviewTab project={project} />)).not.toContain("Xác nhận thay khách hàng");

    // A revision request is a decision too.
    queryData = {
      ...base,
      variants: [
        { ...groom, revisionRequested: true, currentReview: { ...groom.currentReview!, approvalState: "REVISION_REQUESTED" } },
        base.variants[1],
      ],
    };
    expect(renderToStaticMarkup(<ReviewTab project={project} />)).not.toContain("Xác nhận thay khách hàng");

    // A status that no longer accepts a decision (0053 SA007) hides it as well.
    queryData = { ...base, projectStatus: "READY_TO_PUBLISH" };
    expect(renderToStaticMarkup(<ReviewTab project={project} />)).not.toContain("Xác nhận thay khách hàng");
    queryData = base;
  });

  /** TE-06: staff see who confirmed and through which channel; the note stays labelled internal. */
  it("shows a staff-confirmed approval with its channel and internal note", () => {
    const base = queryData!;
    const groom = base.variants[0];
    queryData = {
      ...base,
      projectStatus: "APPROVED",
      reviewOutcome: "APPROVED",
      variants: [
        {
          ...groom,
          approved: true,
          currentReview: {
            ...groom.currentReview!,
            approvalState: "APPROVED",
            feedbackCount: 1,
            feedback: [
              {
                id: "fb2",
                invitationVersionId: VERSION_ID,
                feedbackType: "APPROVAL",
                message: null,
                createdAt: "2026-10-02T00:00:00.000Z",
                actorType: "STAFF",
                approvalChannel: "ZALO",
                staffNote: "Chị Hà xác nhận lúc 20:15",
              },
            ],
          },
        },
        base.variants[1],
      ],
    };
    const html = renderToStaticMarkup(<ReviewTab project={project} />);
    expect(html).toContain("Nhân sự xác nhận thay khách hàng");
    expect(html).toContain("Zalo");
    expect(html).toContain("Ghi chú nội bộ: Chị Hà xác nhận lúc 20:15");
    queryData = base;
  });

  it("maps 422 BLOCKED to its issues and 409 to a reload message", () => {
    const issues = [{ code: "GROOM_NAME_MISSING", severity: "BLOCKING", message: "m" }];
    expect(createReviewErrorFeedback(new AdminApiError(422, "x", { error: "x", issues }))).toEqual({ kind: "BLOCKED", issues });
    const conflict = createReviewErrorFeedback(new AdminApiError(409, "raw server text"));
    expect(conflict.kind).toBe("ERROR");
    expect(JSON.stringify(conflict)).not.toContain("raw server text");
  });

  /** TE-06: the approval action maps its own failures to fixed Vietnamese staff text. */
  it("maps approval-on-behalf failures to fixed messages and never echoes server text", () => {
    expect(confirmApprovalErrorFeedback(new AdminApiError(403, "x"))).toContain("không có quyền");
    expect(confirmApprovalErrorFeedback(new AdminApiError(409, "raw server text"))).not.toContain("raw server text");
    expect(confirmApprovalErrorFeedback(new AdminApiError(400, "raw server text"))).not.toContain("raw server text");
    expect(confirmApprovalErrorFeedback(new Error("boom"))).not.toContain("boom");
  });
});
