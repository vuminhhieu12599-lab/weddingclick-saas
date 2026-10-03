import Link from "next/link";

import { INVITATION_VARIANTS, type InvitationVariant } from "../../../../../../../lib/domain";
import { EmptyState, ErrorState, LoadingState } from "../../../../_components/page-states";
import { PREVIEW_VARIANT_LABELS, type PreviewState } from "./preview-state";

export type PreviewWidth = "MOBILE" | "DESKTOP";

const WIDTH_LABELS: Readonly<Record<PreviewWidth, string>> = {
  MOBILE: "Di động",
  DESKTOP: "Máy tính",
};

const SEGMENT_BASE = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
const SEGMENT_ACTIVE = "bg-slate-900 text-white";
const SEGMENT_IDLE = "text-slate-600 hover:bg-slate-100";

interface StaffPreviewViewProps {
  projectId: string;
  /** `null` when the URL carries an unrecognized variant. */
  variant: InvitationVariant | null;
  state: PreviewState | null;
  loading: boolean;
  onRetry: () => void;
  width: PreviewWidth;
  onWidthChange: (width: PreviewWidth) => void;
}

function PreviewToolbar({
  projectId,
  variant,
  width,
  onWidthChange,
}: Pick<StaffPreviewViewProps, "projectId" | "variant" | "width" | "onWidthChange">) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/v2/projects/${encodeURIComponent(projectId)}`}
            className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
          >
            ← Quay lại dự án
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">Xem trước thiệp mời</h1>
            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
              Bản xem trước — chưa xuất bản
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <nav aria-label="Biến thể thiệp" className="flex flex-wrap gap-1 rounded-lg border border-slate-200 p-1">
          {INVITATION_VARIANTS.map((option) => (
            <Link
              key={option}
              href={{ query: { variant: option } }}
              replace
              scroll={false}
              aria-current={option === variant ? "page" : undefined}
              className={`${SEGMENT_BASE} ${option === variant ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
            >
              {PREVIEW_VARIANT_LABELS[option]}
            </Link>
          ))}
        </nav>

        <div role="group" aria-label="Độ rộng xem trước" className="flex gap-1 rounded-lg border border-slate-200 p-1">
          {(Object.keys(WIDTH_LABELS) as PreviewWidth[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === width}
              onClick={() => onWidthChange(option)}
              className={`${SEGMENT_BASE} ${option === width ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
            >
              {WIDTH_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Real CSS-pixel viewport widths of the isolated preview document. `null` = the full available width. */
export const PREVIEW_FRAME_WIDTH_PX: Readonly<Record<PreviewWidth, number | null>> = {
  MOBILE: 390,
  DESKTOP: null,
};

/** Same-origin staff-only document; carries only the project id and variant, never a token. */
export function previewFrameSrc(projectId: string, variant: InvitationVariant): string {
  return `/admin/preview-frame/${encodeURIComponent(projectId)}?${new URLSearchParams({ variant }).toString()}`;
}

/**
 * The invitation renders inside an iframe, so it owns a true viewport:
 * 100svh/100vh, `position: fixed` (music control) and scrolling all resolve
 * against the frame, never the admin page. The frame height is bounded so
 * the admin page stays usable; the invitation scrolls inside it. No
 * scaling and no width clamp on the renderer content itself.
 */
function PreviewFrame({ projectId, variant, width }: { projectId: string; variant: InvitationVariant; width: PreviewWidth }) {
  const widthPx = PREVIEW_FRAME_WIDTH_PX[width];
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-2 sm:p-4">
      <iframe
        // Keyed by variant + width so per-invitation client state (music, reveal) starts fresh.
        key={`${variant}-${width}`}
        data-preview-frame={width}
        src={previewFrameSrc(projectId, variant)}
        title={`Bản xem trước thiệp — ${PREVIEW_VARIANT_LABELS[variant]}`}
        width={widthPx ?? undefined}
        className="mx-auto block border-0 bg-white shadow-sm"
        style={{
          width: widthPx === null ? "100%" : `${widthPx}px`,
          height: "max(560px, min(844px, calc(100svh - 15rem)))",
        }}
      />
    </div>
  );
}

function BlockedState({
  projectId,
  issues,
  variant,
  onRetry,
}: {
  projectId: string;
  issues: Extract<PreviewState, { status: "BLOCKED" }>["issues"];
  variant: InvitationVariant;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <p className="text-sm font-medium text-amber-800">Chưa thể xem trước thiệp mời</p>
      <p className="mt-1 text-sm text-amber-700">
        Dữ liệu dự án còn thiếu thông tin bắt buộc cho biến thể {PREVIEW_VARIANT_LABELS[variant]}. Hãy bổ sung dữ
        liệu rồi tải lại bản xem trước.
      </p>
      <ul className="mt-3 space-y-1.5">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${index}`} className="text-sm text-amber-800">
            <span className="mr-2 rounded bg-white px-1.5 py-0.5 font-mono text-xs text-amber-700 ring-1 ring-inset ring-amber-200">
              {issue.code}
            </span>
            {issue.message}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/admin/v2/projects/${encodeURIComponent(projectId)}?tab=DATA`}
          className="rounded-lg bg-amber-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
        >
          Nhập dữ liệu
        </Link>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-amber-300 bg-white px-4 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
        >
          Tải lại
        </button>
      </div>
    </div>
  );
}

function PreviewBody({ projectId, variant, state, loading, onRetry, width }: Omit<StaffPreviewViewProps, "onWidthChange">) {
  if (variant === null || state?.status === "INVALID_VARIANT") {
    return (
      <EmptyState
        title="Biến thể xem trước không hợp lệ"
        description="Hãy chọn Thiệp chung, Nhà trai hoặc Nhà gái ở thanh công cụ phía trên."
      />
    );
  }

  if (loading || state === null) {
    return <LoadingState label="Đang tạo bản xem trước..." />;
  }

  switch (state.status) {
    case "READY":
      return (
        <PreviewFrame projectId={projectId} variant={variant} width={width} />
      );
    case "BLOCKED":
      return <BlockedState projectId={projectId} issues={state.issues} variant={variant} onRetry={onRetry} />;
    case "NO_DESIGN":
      return (
        <div className="space-y-3 text-center">
          <EmptyState
            title="Dự án này chưa được cấu hình thiết kế."
            description="Cần chọn mẫu thiệp cho dự án trước khi có thể xem trước thiệp mời."
          />
          <Link
            href={`/admin/v2/projects/${encodeURIComponent(projectId)}?tab=DESIGN`}
            className="inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Chọn mẫu thiệp
          </Link>
        </div>
      );
    case "NOT_FOUND":
      return (
        <EmptyState
          title="Không tìm thấy dự án"
          description="Dự án không tồn tại hoặc tài khoản không có quyền truy cập."
        />
      );
    case "ERROR":
      return <ErrorState message={state.message} onRetry={state.retryable ? onRetry : undefined} />;
  }
}

/** Staff preview chrome + states; READY output renders in the isolated frame. Read-only. */
export function StaffPreviewView(props: StaffPreviewViewProps) {
  return (
    <div>
      <PreviewToolbar
        projectId={props.projectId}
        variant={props.variant}
        width={props.width}
        onWidthChange={props.onWidthChange}
      />
      <div className="mt-4">
        <PreviewBody
          projectId={props.projectId}
          variant={props.variant}
          state={props.state}
          loading={props.loading}
          onRetry={props.onRetry}
          width={props.width}
        />
      </div>
    </div>
  );
}
