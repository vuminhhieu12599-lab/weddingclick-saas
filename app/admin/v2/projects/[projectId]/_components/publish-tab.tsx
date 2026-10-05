"use client";

import { useState } from "react";

import {
  fetchProjectPublishState,
  markProjectPaid,
  publishInvitationVariant,
  transitionProjectStatus,
} from "../../../../../../lib/admin/admin-api-client";
import { AdminApiError } from "../../../../../../lib/admin/admin-api-error";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import { formatDateTimeVi } from "../../../../../../lib/presentation/format-date";
import { getProjectStatusLabel } from "../../../../../../lib/presentation/project-status-labels";
import type {
  ProjectPublishState,
  PublishBlockerReason,
  RequiredVariantPublishState,
} from "../../../../../../lib/server/invitation-publish/invitation-publish-types";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import { PREVIEW_VARIANT_LABELS } from "../preview/_components/preview-state";

const BLOCKER_MESSAGES: Readonly<Record<NonNullable<RequiredVariantPublishState["blocker"]>, string>> = {
  LIFECYCLE_NOT_READY: "Dự án chưa ở trạng thái “Sẵn sàng xuất bản”.",
  PAYMENT_NOT_READY: "Dự án chưa được xác nhận thanh toán.",
  PROJECT_CLOSED: "Dự án đã xuất bản hoặc đã đóng.",
  NO_REVIEW: "Chưa có bản duyệt.",
  REVISION_REQUESTED: "Khách đã yêu cầu chỉnh sửa bản duyệt hiện tại — cần tạo bản duyệt mới.",
  NOT_APPROVED: "Bản duyệt hiện tại chưa được khách duyệt (hoặc chưa đủ các thiệp bắt buộc được duyệt).",
  ALREADY_PUBLISHED: "Bản duyệt hiện tại đã được xuất bản.",
  STALE_REVIEW: "Bản duyệt hiện tại vừa thay đổi.",
  STALE_PUBLISHED_VERSION: "Bản xuất bản hiện tại vừa thay đổi.",
};

const PROJECT_BLOCKER_TEXT: Readonly<Record<NonNullable<ProjectPublishState["projectBlocker"]>, string>> = {
  LIFECYCLE_NOT_READY:
    "Chỉ xuất bản được khi dự án ở trạng thái “Sẵn sàng xuất bản” (khách đã duyệt → chờ thanh toán → đã thanh toán → sẵn sàng xuất bản).",
  PAYMENT_NOT_READY: "Chưa xác nhận thanh toán. Xác nhận thanh toán rồi chuyển dự án sang “Sẵn sàng xuất bản” trước khi xuất bản.",
  PROJECT_CLOSED: "Dự án đã xuất bản hoặc đã đóng. Không có thao tác xuất bản mới.",
};

type PublishErrorFeedback = { kind: "ERROR"; message: string };
type PublishFeedback = { kind: "PUBLISHED"; versionNumber: number } | PublishErrorFeedback;

function conflictReason(body: unknown): PublishBlockerReason | null {
  if (typeof body === "object" && body !== null && "reason" in body && typeof body.reason === "string" && body.reason in BLOCKER_MESSAGES) {
    return body.reason as PublishBlockerReason;
  }
  return null;
}

/** Fixed Vietnamese staff messages; a 409 is explained by its stable reason. */
export function publishErrorFeedback(error: unknown): PublishErrorFeedback {
  if (error instanceof AdminApiError) {
    switch (error.status) {
      case 401:
        return { kind: "ERROR", message: "Phiên đăng nhập nhân sự đã hết hạn. Vui lòng đăng nhập lại." };
      case 403:
        return { kind: "ERROR", message: "Tài khoản không có quyền xuất bản." };
      case 404:
        return { kind: "ERROR", message: "Không tìm thấy dự án." };
      case 409: {
        const reason = conflictReason(error.body);
        const detail = reason === null ? "Trạng thái xuất bản vừa thay đổi." : BLOCKER_MESSAGES[reason];
        return { kind: "ERROR", message: `Chưa xuất bản: ${detail} Đã tải lại trạng thái — kiểm tra rồi thử lại nếu cần.` };
      }
      case 422:
        return { kind: "ERROR", message: "Không thể xuất bản thiệp này với gói dịch vụ hiện tại." };
    }
  }
  return { kind: "ERROR", message: "Không thể xuất bản lúc này. Vui lòng thử lại." };
}

function VariantPublishCard({
  projectId,
  row,
  onChanged,
}: {
  projectId: string;
  row: RequiredVariantPublishState;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<PublishFeedback | null>(null);
  const review = row.currentReview;
  const published = row.publishedVersion;

  async function handlePublish() {
    if (pending || review === null) {
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const created = await publishInvitationVariant(projectId, row.variant, review.id, published?.id ?? null);
      setFeedback({ kind: "PUBLISHED", versionNumber: created.versionNumber });
      setConfirming(false);
      onChanged();
    } catch (error) {
      setFeedback(publishErrorFeedback(error));
      setConfirming(false);
      if (error instanceof AdminApiError && error.status === 409) {
        onChanged();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid={`publish-variant-${row.variant}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{PREVIEW_VARIANT_LABELS[row.variant]}</p>
          <p className="text-sm text-slate-700">
            {review === null ? (
              "Chưa có bản duyệt"
            ) : (
              <>
                Bản duyệt hiện tại: <span className="font-medium">#{review.versionNumber}</span>
                {review.approvalState === "APPROVED" ? " · Khách đã duyệt" : " · Chưa được duyệt"}
              </>
            )}
          </p>
          <p className="text-sm text-slate-700">
            {published === null ? (
              "Chưa xuất bản"
            ) : (
              <>
                Bản xuất bản hiện tại: <span className="font-medium">#{published.versionNumber}</span>
                {published.sourceReviewVersionNumber !== null && ` (từ bản duyệt #${published.sourceReviewVersionNumber})`} ·{" "}
                {formatDateTimeVi(published.publishedAt)}
              </>
            )}
          </p>
          {row.blocker !== null && (
            <p className={`text-sm ${row.blocker === "ALREADY_PUBLISHED" ? "text-emerald-700" : "text-amber-700"}`} data-testid={`publish-blocker-${row.variant}`}>
              {BLOCKER_MESSAGES[row.blocker]}
            </p>
          )}
        </div>
        {row.canPublish && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            {published === null ? `Xuất bản bản duyệt #${review?.versionNumber}` : `Xuất bản lại từ bản duyệt #${review?.versionNumber}`}
          </button>
        )}
      </div>

      {row.canPublish && confirming && review !== null && (
        <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3" role="group" aria-label="Xác nhận xuất bản">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Bản duyệt #{review.versionNumber} đã được khách duyệt sẽ được cố định thành một bản xuất bản mới.</li>
            <li>Chỉnh sửa dữ liệu nháp sau này không làm thay đổi bản xuất bản này.</li>
            <li>Sau này có thể xuất bản một bản duyệt mới hơn (đã được duyệt) thành một bản xuất bản khác.</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={pending}
              className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending ? "Đang xuất bản..." : "Xác nhận xuất bản"}
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

      {feedback?.kind === "PUBLISHED" && (
        <p className="mt-3 text-sm text-emerald-700" role="status">
          Đã xuất bản bản #{feedback.versionNumber}.
        </p>
      )}
      {feedback?.kind === "ERROR" && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {feedback.message}
        </p>
      )}
    </div>
  );
}

type PaymentStep = "TO_AWAITING_PAYMENT" | "MARK_PAID" | "TO_READY_TO_PUBLISH";

const PAYMENT_STEP_COPY: Readonly<Record<PaymentStep, { action: string; confirm: string; pending: string }>> = {
  TO_AWAITING_PAYMENT: {
    action: "Chuyển sang “Chờ thanh toán”",
    confirm: "Chuyển dự án sang trạng thái “Chờ thanh toán”? Khách đã duyệt không có nghĩa là đã thanh toán.",
    pending: "Đang chuyển...",
  },
  MARK_PAID: {
    action: "Xác nhận đã thanh toán",
    confirm: "Chỉ xác nhận khi đã thực nhận thanh toán của khách. Thao tác này không xuất bản thiệp.",
    pending: "Đang xác nhận...",
  },
  TO_READY_TO_PUBLISH: {
    action: "Chuyển sang “Sẵn sàng xuất bản”",
    confirm: "Chuyển dự án sang trạng thái “Sẵn sàng xuất bản”? Việc xuất bản vẫn cần thao tác riêng cho từng thiệp.",
    pending: "Đang chuyển...",
  },
};

/**
 * Next Task 025 payment-lifecycle step, or `null` when none applies here.
 * Mirrors the frozen manual graph APPROVED -> AWAITING_PAYMENT ->
 * (MARK_PAID) -> READY_TO_PUBLISH for display only; the RPCs remain the
 * sole authority and reject any illegal step.
 */
export function nextPaymentStep(state: Pick<ProjectPublishState, "projectStatus" | "paymentStatus">): PaymentStep | null {
  if (state.projectStatus === "APPROVED") {
    return "TO_AWAITING_PAYMENT";
  }
  if (state.projectStatus === "AWAITING_PAYMENT") {
    return state.paymentStatus === "PAID" ? "TO_READY_TO_PUBLISH" : "MARK_PAID";
  }
  return null;
}

function paymentStepErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    switch (error.status) {
      case 401:
        return "Phiên đăng nhập nhân sự đã hết hạn. Vui lòng đăng nhập lại.";
      case 403:
        return "Tài khoản không có quyền thực hiện thao tác này.";
      case 404:
        return "Không tìm thấy dự án.";
      case 409:
      case 422:
        return "Trạng thái dự án vừa thay đổi hoặc chưa đủ điều kiện. Đã tải lại trạng thái — kiểm tra rồi thử lại nếu cần.";
    }
  }
  return "Không thể cập nhật lúc này. Vui lòng thử lại.";
}

/** Staff-only Task 025 payment/lifecycle step shown above the publish cards. */
function PaymentLifecycleCard({ projectId, step, onChanged }: { projectId: string; step: PaymentStep; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = PAYMENT_STEP_COPY[step];

  async function handleConfirm() {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (step === "MARK_PAID") {
        await markProjectPaid(projectId);
      } else {
        await transitionProjectStatus(projectId, step === "TO_AWAITING_PAYMENT" ? "AWAITING_PAYMENT" : "READY_TO_PUBLISH");
      }
      setConfirming(false);
      onChanged();
    } catch (caught) {
      setError(paymentStepErrorMessage(caught));
      setConfirming(false);
      if (caught instanceof AdminApiError && (caught.status === 409 || caught.status === 422)) {
        onChanged();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="payment-lifecycle">
      {!confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          {copy.action}
        </button>
      )}
      {confirming && (
        <div className="rounded-lg border border-slate-300 bg-slate-50 p-3" role="group" aria-label={copy.action}>
          <p className="text-sm text-slate-700">{copy.confirm}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={pending}
              className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending ? copy.pending : "Xác nhận"}
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
      {error !== null && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Task 031 staff publish area: per REQUIRED variant (canonical package
 * policy, server-derived) the approved current review, the current
 * publication, the first blocker, and a confirmed publish action. No
 * public link, QR, sharing, analytics, guest or rollback controls here.
 */
export function PublishTab({ project }: { project: ProjectSummary }) {
  const { data, loading, error, reload } = useAdminQuery(() => fetchProjectPublishState(project.id), [project.id]);
  const paymentStep = data === null ? null : nextPaymentStep(data);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-slate-400">Trạng thái dự án</p>
        <p className="mt-1 text-sm font-medium text-slate-800">{getProjectStatusLabel(data?.projectStatus ?? project.status)}</p>
        {data !== null && (
          <p className="mt-1 text-xs text-slate-500">{data.paymentStatus === "PAID" ? "Đã thanh toán" : "Chưa thanh toán"}</p>
        )}
      </div>

      {paymentStep !== null && (
        <PaymentLifecycleCard key={paymentStep} projectId={project.id} step={paymentStep} onChanged={reload} />
      )}

      {loading && data === null && <LoadingState label="Đang tải trạng thái xuất bản..." />}
      {error !== null && <ErrorState message={error} onRetry={reload} />}

      {data !== null && data.requiredVariants === null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Gói dịch vụ “{data.packageCode}” chưa có quy tắc biến thể thiệp. Không thể xuất bản.
        </div>
      )}

      {data !== null && data.requiredVariants !== null && (
        <>
          {data.allRequiredVariantsPublished ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" data-testid="publish-summary">
              Tất cả thiệp bắt buộc đã được xuất bản từ bản duyệt hiện tại.
            </div>
          ) : (
            data.projectBlocker !== null && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" data-testid="publish-summary">
                {PROJECT_BLOCKER_TEXT[data.projectBlocker]}
              </div>
            )
          )}
          {data.variants.map((row) => (
            <VariantPublishCard key={row.variant} projectId={project.id} row={row} onChanged={reload} />
          ))}
        </>
      )}
    </div>
  );
}
