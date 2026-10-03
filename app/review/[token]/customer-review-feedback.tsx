"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ReviewFeedbackType, ReviewVersionState } from "../../../lib/domain";
import type { CustomerReviewFeedbackItem } from "../../../lib/server/customer-review/customer-review-types";

const FEEDBACK_TYPE_LABELS: Readonly<Record<ReviewFeedbackType, string>> = {
  COMMENT: "Góp ý",
  REVISION_REQUEST: "Yêu cầu chỉnh sửa",
  APPROVAL: "Đã duyệt thiệp",
};

const STATE_LABELS: Readonly<Record<ReviewVersionState, string>> = {
  AWAITING_FEEDBACK: "Đang chờ bạn duyệt",
  REVISION_REQUESTED: "Bạn đã yêu cầu chỉnh sửa — WeddingClick sẽ gửi bản duyệt mới",
  APPROVED: "Bạn đã duyệt bản này. Nếu cần thay đổi, WeddingClick sẽ gửi bản duyệt mới để bạn duyệt lại.",
};

const MESSAGE_MAX = 2000;

type Notice = { tone: "ok" | "error"; text: string };

/** Fixed Vietnamese messages; server text is never shown to the customer. */
export function feedbackErrorNotice(status: number, reason: unknown): Notice {
  if (status === 409 && reason === "REVIEW_SUPERSEDED") {
    return { tone: "error", text: "Bản duyệt này đã được thay thế bằng phiên bản mới. Trang đã được tải lại để hiển thị bản mới." };
  }
  if (status === 409 && reason === "ALREADY_DECIDED") {
    return { tone: "error", text: "Bản duyệt này đã có quyết định (đã duyệt hoặc đã yêu cầu chỉnh sửa). Nếu cần thay đổi, vui lòng liên hệ WeddingClick để nhận bản duyệt mới." };
  }
  if (status === 409) {
    return { tone: "error", text: "Bản duyệt hiện không nhận phản hồi. Vui lòng liên hệ WeddingClick." };
  }
  if (status === 404 || status === 410) {
    return { tone: "error", text: "Link duyệt không còn hiệu lực. Vui lòng liên hệ WeddingClick để nhận link mới." };
  }
  if (status === 400) {
    return { tone: "error", text: "Nội dung chưa hợp lệ. Vui lòng nhập lời nhắn (tối đa 2000 ký tự)." };
  }
  return { tone: "error", text: "Chưa gửi được phản hồi. Vui lòng thử lại." };
}

const SUCCESS_TEXT: Readonly<Record<ReviewFeedbackType, string>> = {
  COMMENT: "Đã gửi góp ý.",
  REVISION_REQUEST: "Đã gửi yêu cầu chỉnh sửa. WeddingClick sẽ gửi bản duyệt mới cho bạn.",
  APPROVAL: "Cảm ơn bạn! Đã ghi nhận duyệt thiệp.",
};

interface CustomerReviewFeedbackProps {
  readonly token: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly state: ReviewVersionState;
  readonly feedbackOpen: boolean;
  readonly feedback: readonly CustomerReviewFeedbackItem[];
}

/**
 * Customer feedback panel for ONE current review version (Task 030B). Sends
 * only { invitationVersionId, feedbackType, message } with the REVIEW token
 * as Bearer; the server binds everything else. Success is shown only after
 * the server confirmed persistence (201); then the page re-renders from the
 * server. Approval needs an explicit second click (no browser dialog).
 */
export function CustomerReviewFeedback({ token, versionId, versionNumber, state, feedbackOpen, feedback }: CustomerReviewFeedbackProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<ReviewFeedbackType | null>(null);
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function submit(feedbackType: ReviewFeedbackType) {
    if (pending !== null) {
      return;
    }
    const trimmed = message.trim();
    if (feedbackType !== "APPROVAL" && trimmed === "") {
      setNotice({ tone: "error", text: "Vui lòng nhập nội dung trước khi gửi." });
      return;
    }
    setPending(feedbackType);
    setNotice(null);
    try {
      const response = await fetch("/api/v2/public/review-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invitationVersionId: versionId, feedbackType, message: trimmed === "" ? null : trimmed }),
        cache: "no-store",
      });
      if (response.status === 201) {
        setNotice({ tone: "ok", text: SUCCESS_TEXT[feedbackType] });
        setMessage("");
        router.refresh();
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      const reason = typeof body === "object" && body !== null && "reason" in body ? body.reason : undefined;
      setNotice(feedbackErrorNotice(response.status, reason));
      if (response.status === 409) {
        router.refresh();
      }
    } catch {
      setNotice(feedbackErrorNotice(0, undefined));
    } finally {
      setPending(null);
      setConfirmApproval(false);
    }
  }

  const canApprove = feedbackOpen && state === "AWAITING_FEEDBACK";
  // The first decision on a version is final: an approved version needs a NEW review for further changes.
  const canRequestRevision = feedbackOpen && state === "AWAITING_FEEDBACK";

  return (
    <section id="review-feedback" className="mx-auto w-full max-w-xl px-4 py-8" aria-label="Phản hồi bản duyệt">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-stone-900">Phản hồi cho bản duyệt #{versionNumber}</p>
        <p className={`mt-1 text-sm ${state === "APPROVED" ? "text-emerald-700" : state === "REVISION_REQUESTED" ? "text-amber-700" : "text-stone-600"}`}>
          {STATE_LABELS[state]}
        </p>

        {feedback.length > 0 && (
          <ul className="mt-4 space-y-2">
            {feedback.map((item) => (
              <li key={item.id} className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
                <span className="font-medium">{FEEDBACK_TYPE_LABELS[item.feedbackType]}</span>
                {item.message !== null && <p className="mt-1 whitespace-pre-wrap break-words">{item.message}</p>}
              </li>
            ))}
          </ul>
        )}

        {feedbackOpen ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-stone-700" htmlFor={`review-message-${versionId}`}>
              Lời nhắn (bắt buộc khi góp ý hoặc yêu cầu chỉnh sửa)
            </label>
            <textarea
              id={`review-message-${versionId}`}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={MESSAGE_MAX}
              rows={4}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-base text-stone-900"
              placeholder="Ví dụ: Sửa giúp mình giờ đón khách thành 17:30."
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void submit("COMMENT")}
                disabled={pending !== null}
                className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 disabled:opacity-50"
              >
                {pending === "COMMENT" ? "Đang gửi..." : "Gửi góp ý"}
              </button>
              {canRequestRevision && (
                <button
                  type="button"
                  onClick={() => void submit("REVISION_REQUEST")}
                  disabled={pending !== null}
                  className="min-h-11 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-800 disabled:opacity-50"
                >
                  {pending === "REVISION_REQUEST" ? "Đang gửi..." : "Yêu cầu chỉnh sửa"}
                </button>
              )}
              {canApprove &&
                (confirmApproval ? (
                  <button
                    type="button"
                    onClick={() => void submit("APPROVAL")}
                    disabled={pending !== null}
                    className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {pending === "APPROVAL" ? "Đang gửi..." : `Xác nhận duyệt bản #${versionNumber}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmApproval(true)}
                    disabled={pending !== null}
                    className="min-h-11 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Duyệt thiệp
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-600">Bản duyệt hiện không nhận phản hồi. Vui lòng liên hệ WeddingClick nếu cần thay đổi.</p>
        )}

        {notice !== null && (
          <p className={`mt-3 text-sm ${notice.tone === "ok" ? "text-emerald-700" : "text-red-700"}`} role={notice.tone === "ok" ? "status" : "alert"}>
            {notice.text}
          </p>
        )}
      </div>
    </section>
  );
}
