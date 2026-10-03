import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { CustomerReviewFeedback, feedbackErrorNotice } = await import("../customer-review-feedback");

/** Task 030B customer REVIEW feedback panel: canonical actions per state, safe Vietnamese stale/closed states. */

const props = {
  token: "t".repeat(43),
  versionId: "f0000000-0000-4000-8000-0000000000a1",
  versionNumber: 2,
  feedback: [],
} as const;

describe("CustomerReviewFeedback", () => {
  it("awaiting review offers COMMENT, Yêu cầu chỉnh sửa and Duyệt thiệp — no RSVP/publish/share controls", () => {
    const html = renderToStaticMarkup(<CustomerReviewFeedback {...props} state="AWAITING_FEEDBACK" feedbackOpen />);
    expect(html).toContain("Gửi góp ý");
    expect(html).toContain("Yêu cầu chỉnh sửa");
    expect(html).toContain("Duyệt thiệp");
    expect(html).not.toMatch(/RSVP|Xuất bản|Chia sẻ|publish/i);
  });

  it("approval is final: an approved version offers neither approval nor revision; a revision-requested one cannot be approved", () => {
    const approved = renderToStaticMarkup(<CustomerReviewFeedback {...props} state="APPROVED" feedbackOpen />);
    expect(approved).toContain("Bạn đã duyệt bản này");
    expect(approved).not.toContain(">Duyệt thiệp<");
    expect(approved).not.toContain(">Yêu cầu chỉnh sửa<");
    const revision = renderToStaticMarkup(<CustomerReviewFeedback {...props} state="REVISION_REQUESTED" feedbackOpen />);
    expect(revision).not.toContain(">Duyệt thiệp<");
    expect(revision).not.toContain(">Yêu cầu chỉnh sửa<");
  });

  it("a closed review shows no actions; a superseded submit shows the replacement message, never server text", () => {
    const closed = renderToStaticMarkup(<CustomerReviewFeedback {...props} state="AWAITING_FEEDBACK" feedbackOpen={false} />);
    expect(closed).toContain("không nhận phản hồi");
    expect(closed).not.toContain("Gửi góp ý");
    expect(feedbackErrorNotice(409, "REVIEW_SUPERSEDED").text).toContain("Bản duyệt này đã được thay thế bằng phiên bản mới.");
    expect(feedbackErrorNotice(410, undefined).text).toContain("không còn hiệu lực");
  });
});
