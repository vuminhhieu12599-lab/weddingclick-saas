import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../../../../../../lib/admin/admin-api-error";
import type { ProjectPublishState } from "../../../../../../../lib/server/invitation-publish/invitation-publish-types";
import type { ProjectSummary } from "../../../../../../../lib/server/projects/project-types";

/** Xuất bản tab: per-required-variant publish state, blockers, publish action; no public link/QR/share. */

let queryData: ProjectPublishState | null = null;

vi.mock("../../../../../../../lib/admin/use-admin-query", () => ({
  useAdminQuery: () => ({ data: queryData, loading: false, error: null, reload: () => {} }),
}));
vi.mock("../../../../../../../lib/admin/admin-api-client", () => ({
  fetchProjectPublishState: vi.fn(),
  publishInvitationVariant: vi.fn(),
  assignInvitationPublicAlias: vi.fn(),
  markProjectPaid: vi.fn(),
  transitionProjectStatus: vi.fn(),
}));

const { PublishTab, nextPaymentStep, publishErrorFeedback } = await import("../publish-tab");
const { friendlyLinkFailure } = await import("../public-link-panel");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const project = { id: PROJECT_ID, status: "READY_TO_PUBLISH" } as ProjectSummary;
const review = (versionNumber: number) => ({
  id: `f0000000-0000-4000-8000-00000000000${versionNumber}`,
  versionNumber,
  createdAt: "2026-10-01T00:00:00.000Z",
  approvalState: "APPROVED" as const,
});

describe("PublishTab", () => {
  it("SEPARATE ready: publishable side shows the publish action; published side shows its version and source review", () => {
    queryData = {
      projectId: PROJECT_ID,
      projectStatus: "READY_TO_PUBLISH",
      paymentStatus: "PAID",
      packageCode: "SEPARATE",
      requiredVariants: ["GROOM", "BRIDE"],
      projectBlocker: null,
      allRequiredVariantsPublished: false,
      publicLinks: [],
      variants: [
        {
          variant: "GROOM",
          invitationId: "a1",
          currentReview: review(1),
          publishedVersion: {
            id: "e1",
            invitationId: "a1",
            projectId: PROJECT_ID,
            versionNumber: 2,
            sourceReviewVersionId: review(1).id,
            sourceReviewVersionNumber: 1,
            templateVersionId: "t",
            rendererKeySnapshot: "r",
            publishedAt: "2026-10-02T00:00:00.000Z",
          },
          upToDate: true,
          canPublish: false,
          blocker: "ALREADY_PUBLISHED",
        },
        { variant: "BRIDE", invitationId: "a2", currentReview: review(3), publishedVersion: null, upToDate: false, canPublish: true, blocker: null },
      ],
    };
    const html = renderToStaticMarkup(<PublishTab project={project} />);
    expect(html).toContain('data-testid="publish-variant-GROOM"');
    expect(html).toContain("Bản xuất bản hiện tại: <span class=\"font-medium\">#2</span> (từ bản duyệt #1)");
    expect(html).toContain("Bản duyệt hiện tại đã được xuất bản.");
    expect(html).toContain("Xuất bản bản duyệt #3");
    expect(html).not.toMatch(/\/i\/|QR|Chia sẻ|Hoàn tác/);
  });

  it("payment not ready: project blocker and no publish action", () => {
    queryData = {
      projectId: PROJECT_ID,
      projectStatus: "APPROVED",
      paymentStatus: "UNPAID",
      packageCode: "COMMON",
      requiredVariants: ["COMMON"],
      projectBlocker: "PAYMENT_NOT_READY",
      allRequiredVariantsPublished: false,
      publicLinks: [],
      variants: [
        { variant: "COMMON", invitationId: "a1", currentReview: review(1), publishedVersion: null, upToDate: false, canPublish: false, blocker: "PAYMENT_NOT_READY" },
      ],
    };
    const html = renderToStaticMarkup(<PublishTab project={project} />);
    expect(html).toContain("Chưa xác nhận thanh toán");
    expect(html).toContain("Chưa thanh toán");
    expect(html).not.toContain("Xuất bản bản duyệt");
    expect(html).toContain('data-testid="payment-lifecycle"');
    expect(html).toContain("Chuyển sang “Chờ thanh toán”");
    expect(html).not.toContain("Xác nhận đã thanh toán");
  });

  it("payment step follows the Task 025 graph: APPROVED -> AWAITING_PAYMENT -> MARK_PAID -> READY_TO_PUBLISH, nothing else", () => {
    expect(nextPaymentStep({ projectStatus: "APPROVED", paymentStatus: "UNPAID" })).toBe("TO_AWAITING_PAYMENT");
    expect(nextPaymentStep({ projectStatus: "AWAITING_PAYMENT", paymentStatus: "UNPAID" })).toBe("MARK_PAID");
    expect(nextPaymentStep({ projectStatus: "AWAITING_PAYMENT", paymentStatus: "PAID" })).toBe("TO_READY_TO_PUBLISH");
    expect(nextPaymentStep({ projectStatus: "READY_TO_PUBLISH", paymentStatus: "PAID" })).toBeNull();
    expect(nextPaymentStep({ projectStatus: "PUBLISHED", paymentStatus: "PAID" })).toBeNull();
    expect(nextPaymentStep({ projectStatus: "CUSTOMER_REVIEW", paymentStatus: "UNPAID" })).toBeNull();
  });

  it("AWAITING_PAYMENT unpaid shows the mark-paid action, never a publish action", () => {
    queryData = {
      projectId: PROJECT_ID,
      projectStatus: "AWAITING_PAYMENT",
      paymentStatus: "UNPAID",
      packageCode: "COMMON",
      requiredVariants: ["COMMON"],
      projectBlocker: "PAYMENT_NOT_READY",
      allRequiredVariantsPublished: false,
      publicLinks: [],
      variants: [
        { variant: "COMMON", invitationId: "a1", currentReview: review(1), publishedVersion: null, upToDate: false, canPublish: false, blocker: "PAYMENT_NOT_READY" },
      ],
    };
    const html = renderToStaticMarkup(<PublishTab project={project} />);
    expect(html).toContain("Xác nhận đã thanh toán");
    expect(html).not.toContain("Xuất bản bản duyệt");
  });

  it("maps 409 reasons and auth failures to fixed messages", () => {
    expect(publishErrorFeedback(new AdminApiError(409, "x", { error: "x", reason: "STALE_REVIEW" }))).toMatchObject({
      kind: "ERROR",
      message: expect.stringContaining("Bản duyệt hiện tại vừa thay đổi."),
    });
    expect(publishErrorFeedback(new AdminApiError(409, "x", { error: "x", reason: "PAYMENT_NOT_READY" })).message).toContain("thanh toán");
    expect(publishErrorFeedback(new AdminApiError(403, "x")).message).toContain("không có quyền");
    expect(publishErrorFeedback(new Error("boom")).message).toContain("Không thể xuất bản");
  });

  it("LAUNCH-P0-02: published sides show their link with Mở thiệp / Sao chép link; Tạo link đẹp only without alias; unpublished side has no link", () => {
    const publishedVersion = (id: string, inv: string) => ({
      id,
      invitationId: inv,
      projectId: PROJECT_ID,
      versionNumber: 2,
      sourceReviewVersionId: review(1).id,
      sourceReviewVersionNumber: 1,
      templateVersionId: "t",
      rendererKeySnapshot: "r",
      publishedAt: "2026-10-02T00:00:00.000Z",
    });
    const base = {
      projectId: PROJECT_ID,
      projectStatus: "READY_TO_PUBLISH" as const,
      paymentStatus: "PAID" as const,
      packageCode: "SEPARATE",
      requiredVariants: ["GROOM" as const, "BRIDE" as const],
      projectBlocker: null,
      allRequiredVariantsPublished: false,
    };
    queryData = {
      ...base,
      variants: [
        { variant: "GROOM", invitationId: "a1", currentReview: review(1), publishedVersion: publishedVersion("e1", "a1"), upToDate: true, canPublish: false, blocker: "ALREADY_PUBLISHED" },
        { variant: "BRIDE", invitationId: "a2", currentReview: review(1), publishedVersion: publishedVersion("e2", "a2"), upToDate: true, canPublish: false, blocker: "ALREADY_PUBLISHED" },
      ],
      publicLinks: [
        { variant: "GROOM", canonicalPath: "/i/wc-2026-000003-groom", friendlyPath: "/i/minh-anh&thu-ha", canCreateFriendlyLink: false },
        { variant: "BRIDE", canonicalPath: "/i/wc-2026-000003-bride", friendlyPath: null, canCreateFriendlyLink: true },
      ],
    };
    const html = renderToStaticMarkup(<PublishTab project={project} />);
    const groom = html.slice(html.indexOf('data-testid="public-link-GROOM"'), html.indexOf('data-testid="publish-variant-BRIDE"'));
    const bride = html.slice(html.indexOf('data-testid="public-link-BRIDE"'));
    expect(groom).toContain("Link thiệp Nhà trai");
    expect(groom).toContain('href="/i/minh-anh&amp;thu-ha"');
    expect(groom).toContain("Mở thiệp");
    expect(groom).toContain("Sao chép link");
    expect(groom).toContain("Link cũ vẫn hoạt động");
    expect(groom).not.toContain("Tạo link đẹp");
    expect(bride).toContain("Link thiệp Nhà gái");
    expect(bride).toContain('href="/i/wc-2026-000003-bride"');
    expect(bride).toContain("Tạo link đẹp");

    queryData = {
      ...queryData,
      variants: [queryData.variants[0], { variant: "BRIDE", invitationId: "a2", currentReview: review(1), publishedVersion: null, upToDate: false, canPublish: true, blocker: null }],
      publicLinks: [queryData.publicLinks[0]],
    };
    const partial = renderToStaticMarkup(<PublishTab project={project} />);
    expect(partial).not.toContain('data-testid="public-link-BRIDE"');
    expect(partial).not.toContain("wc-2026-000003-bride");
  });

  it("LAUNCH-P0-02: friendly-link failures are usable and never claim the publication failed", () => {
    const taken = friendlyLinkFailure(new AdminApiError(409, "x", { reason: "ALIAS_TAKEN", alias: "minh-anh&thu-ha" }));
    expect(taken.manual).toBe(true);
    expect(taken.suggestion).toEqual({ primary: "minh-anh", secondary: "thu-ha" });
    expect(taken.message).toContain("/i/minh-anh&thu-ha");
    expect(friendlyLinkFailure(new AdminApiError(422, "x", { reason: "ALIAS_UNDERIVABLE" })).manual).toBe(true);
    const generic = friendlyLinkFailure(new Error("network"));
    expect(generic.message).toContain("Thiệp vẫn đã xuất bản");
    expect(generic.message).not.toMatch(/Chưa xuất bản/);
  });
});
