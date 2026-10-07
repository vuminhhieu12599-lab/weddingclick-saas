"use client";

import { useState } from "react";

import {
  createInvitationReviewVersion,
  fetchProjectReviewState,
  issueReviewAccessLink,
} from "../../../../../../lib/admin/admin-api-client";
import { AdminApiError } from "../../../../../../lib/admin/admin-api-error";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { InvitationVariant, ProjectStatus, ReviewFeedbackType, ReviewOutcomeStatus } from "../../../../../../lib/domain";
import type { SnapshotPayloadIssue } from "../../../../../../lib/invitation-rendering/snapshot-payload-types";
import { formatDateTimeVi } from "../../../../../../lib/presentation/format-date";
import { getProjectStatusLabel } from "../../../../../../lib/presentation/project-status-labels";
import type {
  RequiredVariantReviewState,
  ReviewApprovalState,
} from "../../../../../../lib/server/invitation-review/invitation-review-types";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import { PREVIEW_VARIANT_LABELS } from "../preview/_components/preview-state";

const APPROVAL_LABELS: Readonly<Record<ReviewApprovalState, string>> = {
  AWAITING_FEEDBACK: "Chờ khách phản hồi",
  REVISION_REQUESTED: "Khách yêu cầu chỉnh sửa",
  APPROVED: "Khách đã duyệt",
};

const FEEDBACK_TYPE_LABELS: Readonly<Record<ReviewFeedbackType, string>> = {
  COMMENT: "Góp ý",
  REVISION_REQUEST: "Yêu cầu chỉnh sửa",
  APPROVAL: "Duyệt thiệp",
};

const OUTCOME_MESSAGES: Readonly<Record<ReviewOutcomeStatus, { text: string; tone: string }>> = {
  CUSTOMER_REVIEW: { text: "Đang chờ khách duyệt bản duyệt hiện tại.", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  REVISION_REQUIRED: {
    text: "Khách yêu cầu chỉnh sửa. Sửa dữ liệu rồi tạo bản duyệt mới cho thiệp tương ứng — khách sẽ duyệt lại bản mới.",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
  },
  APPROVED: {
    text: "Khách đã duyệt tất cả thiệp bắt buộc trên bản duyệt hiện tại. Đã duyệt không có nghĩa là đã thanh toán hay đã xuất bản.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
};

/** Issues a fresh customer REVIEW link; the raw token is shown once and kept only in component state. */
function ReviewLinkIssuer({ projectId }: { projectId: string }) {
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleIssue() {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const issued = await issueReviewAccessLink(projectId);
      setUrl(`${window.location.origin}/review/${encodeURIComponent(issued.token)}`);
    } catch {
      setError("Không thể tạo link duyệt lúc này. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="review-link-issuer">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Link duyệt cho khách</p>
          <p className="mt-1 text-xs text-slate-500">
            Link luôn hiển thị bản duyệt hiện tại. Mỗi lần bấm tạo một link mới; link cũ vẫn hoạt động cho đến khi bị thu hồi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleIssue()}
          disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "Đang tạo..." : "Tạo link duyệt"}
        </button>
      </div>
      {url !== null && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-800">Sao chép và gửi cho khách. Link chỉ hiển thị một lần.</p>
          <input
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full rounded border border-emerald-200 bg-white px-2 py-1 font-mono text-xs text-slate-800"
            aria-label="Link duyệt cho khách"
          />
        </div>
      )}
      {error !== null && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type CreateFeedback =
  | { kind: "CREATED"; versionNumber: number }
  | { kind: "BLOCKED"; issues: SnapshotPayloadIssue[] }
  | { kind: "ERROR"; message: string };

function blockedIssues(body: unknown): SnapshotPayloadIssue[] | null {
  if (typeof body === "object" && body !== null && "issues" in body && Array.isArray(body.issues)) {
    return body.issues as SnapshotPayloadIssue[];
  }
  return null;
}

/** Fixed Vietnamese staff messages; server text is shown only for the safe 4xx business messages. */
export function createReviewErrorFeedback(error: unknown): CreateFeedback {
  if (error instanceof AdminApiError) {
    const issues = error.status === 422 ? blockedIssues(error.body) : null;
    if (issues !== null) {
      return { kind: "BLOCKED", issues };
    }
    switch (error.status) {
      case 401:
        return { kind: "ERROR", message: "Phiên đăng nhập nhân sự đã hết hạn. Vui lòng đăng nhập lại." };
      case 403:
        return { kind: "ERROR", message: "Tài khoản không có quyền tạo bản duyệt." };
      case 404:
        return { kind: "ERROR", message: "Không tìm thấy dự án." };
      case 409:
        return {
          kind: "ERROR",
          message: "Dữ liệu duyệt hoặc thiết kế vừa thay đổi (có thể do bấm hai lần). Đã tải lại trạng thái — kiểm tra rồi thử lại nếu cần.",
        };
      case 422:
        return { kind: "ERROR", message: "Không thể tạo bản duyệt cho thiệp này với gói dịch vụ / mẫu hiện tại." };
    }
  }
  return { kind: "ERROR", message: "Không thể tạo bản duyệt lúc này. Vui lòng thử lại." };
}

/**
 * Launch Hardening 04 (owner decision D2, migration 0044): a new review may
 * be created from PUBLISHED as an explicit post-publish correction, never
 * from COMPLETED or ARCHIVED. Display only — `create_review_version` stays
 * the authority (RV010).
 */
export type ReviewCreationMode = "OPEN" | "CORRECTION" | "CLOSED";

export function reviewCreationMode(status: ProjectStatus): ReviewCreationMode {
  if (status === "COMPLETED" || status === "ARCHIVED") {
    return "CLOSED";
  }
  return status === "PUBLISHED" ? "CORRECTION" : "OPEN";
}

function VariantReviewCard({
  projectId,
  row,
  mode,
  onChanged,
}: {
  projectId: string;
  row: RequiredVariantReviewState;
  mode: ReviewCreationMode;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<CreateFeedback | null>(null);
  const review = row.currentReview;

  async function handleCreate() {
    if (pending) {
      return;
    }
    setPending(true);
    setConfirming(false);
    setFeedback(null);
    try {
      const created = await createInvitationReviewVersion(projectId, row.variant, review?.id ?? null);
      setFeedback({ kind: "CREATED", versionNumber: created.versionNumber });
      onChanged();
    } catch (error) {
      const next = createReviewErrorFeedback(error);
      setFeedback(next);
      if (error instanceof AdminApiError && error.status === 409) {
        onChanged();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid={`review-variant-${row.variant}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{PREVIEW_VARIANT_LABELS[row.variant]}</p>
          {review === null ? (
            <p className="mt-1 text-sm text-slate-500">Chưa có bản duyệt</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-700">
                Bản duyệt hiện tại: <span className="font-medium">#{review.versionNumber}</span> ·{" "}
                {formatDateTimeVi(review.createdAt)}
              </p>
              <p className={`mt-1 text-sm ${row.approved ? "text-emerald-700" : "text-slate-600"}`}>
                {APPROVAL_LABELS[review.approvalState]}
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {review !== null && (
            <a
              href={`/admin/preview-frame/${encodeURIComponent(projectId)}?reviewVersionId=${encodeURIComponent(review.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Xem bản duyệt #{review.versionNumber}
            </a>
          )}
          {mode === "OPEN" && (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={pending}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? "Đang tạo..." : review === null ? "Tạo bản duyệt" : "Tạo bản duyệt mới"}
            </button>
          )}
          {mode === "CORRECTION" && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={pending}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? "Đang tạo..." : "Chỉnh sửa & duyệt lại"}
            </button>
          )}
        </div>
      </div>

      {mode === "CORRECTION" && confirming && (
        <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3" role="group" aria-label="Xác nhận chỉnh sửa và duyệt lại">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Tạo bản duyệt mới từ dữ liệu hiện tại cho {PREVIEW_VARIANT_LABELS[row.variant]}; dự án chuyển sang “Chờ khách duyệt”.</li>
            <li>Thiệp đang xuất bản vẫn hiển thị cho khách mời, không đổi đường dẫn, cho đến khi xuất bản lại thành công.</li>
            <li>Khách phải duyệt lại bản mới; sau đó đi tiếp các bước chờ thanh toán → sẵn sàng xuất bản → xuất bản lại. Không thu tiền lại.</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={pending}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? "Đang tạo..." : "Xác nhận tạo bản duyệt mới"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}

      {review !== null && review.feedback.length > 0 && (
        <ul className="mt-3 space-y-2" data-testid={`review-feedback-${row.variant}`}>
          {review.feedback.map((item) => (
            <li key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-medium">{FEEDBACK_TYPE_LABELS[item.feedbackType]}</span>
              <span className="ml-2 text-xs text-slate-400">{formatDateTimeVi(item.createdAt)}</span>
              {item.message !== null && <p className="mt-1 whitespace-pre-wrap break-words">{item.message}</p>}
            </li>
          ))}
        </ul>
      )}

      {review !== null && (
        <p className="mt-3 text-xs text-slate-500">
          Bản duyệt là bản chụp cố định của dữ liệu tại thời điểm tạo. Sửa dữ liệu sau đó không làm thay đổi bản này;
          tạo bản duyệt mới sẽ cần khách duyệt lại.
        </p>
      )}

      {feedback?.kind === "CREATED" && (
        <p className="mt-3 text-sm text-emerald-700" role="status">
          Đã tạo bản duyệt #{feedback.versionNumber}.
        </p>
      )}
      {feedback?.kind === "ERROR" && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {feedback.message}
        </p>
      )}
      {feedback?.kind === "BLOCKED" && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" role="alert">
          <p className="text-sm font-medium text-amber-800">Chưa thể tạo bản duyệt: dữ liệu còn thiếu thông tin bắt buộc.</p>
          <ul className="mt-2 space-y-1">
            {feedback.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="text-sm text-amber-800">
                <span className="mr-2 rounded bg-white px-1.5 py-0.5 font-mono text-xs text-amber-700 ring-1 ring-inset ring-amber-200">
                  {issue.code}
                </span>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Task 030 staff review area: per REQUIRED variant (canonical package
 * policy, server-derived), the current immutable REVIEW version, its
 * approval state and customer feedback, an immutable-review preview link
 * and "Tạo bản duyệt"; the Project's persisted status; customer REVIEW
 * link issuance. No publish action and no public link here (Task 031).
 */
export function ReviewTab({ project }: { project: ProjectSummary }) {
  const { data, loading, error, reload } = useAdminQuery(() => fetchProjectReviewState(project.id), [project.id]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-slate-400">Trạng thái dự án</p>
        <p className="mt-1 text-sm font-medium text-slate-800">{getProjectStatusLabel(data?.projectStatus ?? project.status)}</p>
      </div>

      {loading && data === null && <LoadingState label="Đang tải trạng thái duyệt..." />}
      {error !== null && <ErrorState message={error} onRetry={reload} />}

      {data !== null && data.requiredVariants === null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Gói dịch vụ “{data.packageCode}” chưa có quy tắc biến thể thiệp. Không thể tạo bản duyệt.
        </div>
      )}

      {data !== null && data.requiredVariants !== null && (
        <>
          <div
            className={`rounded-xl border p-4 text-sm ${
              data.reviewOutcome === null ? "border-slate-200 bg-slate-50 text-slate-700" : OUTCOME_MESSAGES[data.reviewOutcome].tone
            }`}
            data-testid="review-outcome"
          >
            {data.reviewOutcome === null
              ? `Cần khách duyệt: ${data.requiredVariants.map((v: InvitationVariant) => PREVIEW_VARIANT_LABELS[v]).join(", ")}.`
              : OUTCOME_MESSAGES[data.reviewOutcome].text}
          </div>
          {reviewCreationMode(data.projectStatus) === "CORRECTION" && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800" data-testid="review-correction-notice">
              Thiệp đang được xuất bản. Để sửa: cập nhật dữ liệu nháp, rồi bấm “Chỉnh sửa & duyệt lại” cho thiệp cần sửa. Bản đang
              xuất bản vẫn hiển thị cho khách mời cho đến khi bản mới được khách duyệt và xuất bản lại.
            </div>
          )}
          {reviewCreationMode(data.projectStatus) === "CLOSED" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700" data-testid="review-closed-notice">
              Dự án đã hoàn tất hoặc đã lưu trữ. Không thể tạo bản duyệt mới.
            </div>
          )}
          {data.variants.some((row) => row.currentReview !== null) && <ReviewLinkIssuer projectId={project.id} />}
          {data.variants.map((row) => (
            <VariantReviewCard
              key={row.variant}
              projectId={project.id}
              row={row}
              mode={reviewCreationMode(data.projectStatus)}
              onChanged={reload}
            />
          ))}
        </>
      )}
    </div>
  );
}
