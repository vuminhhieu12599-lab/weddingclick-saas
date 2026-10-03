"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { fetchReviewVersionPreview, fetchStaffInvitationPreview } from "../../../../lib/admin/admin-api-client";
import { useAdminQuery } from "../../../../lib/admin/use-admin-query";
import { loadPreviewState, parsePreviewVariant, previewErrorState, type PreviewState } from "../../v2/projects/[projectId]/preview/_components/preview-state";
import { StaffPreviewRenderer } from "../staff-preview-renderer";

function FrameMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center px-4 text-center text-sm text-slate-500">{text}</div>
  );
}

/**
 * The iframe document. It reuses the same staff preview loader as the
 * parent page: the existing browser staff session supplies the Bearer token
 * to the staff preview API (`requireStaff`, no-store), so the token never
 * appears in this document's URL. Without a staff session the API refuses
 * and nothing renders. The parent owns BLOCKED/no-design/error UX; this
 * document only renders READY output and a neutral message otherwise.
 */
function PreviewFrame() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const searchParams = useSearchParams();
  const variant = parsePreviewVariant(searchParams.get("variant"));
  // Task 030: `?reviewVersionId=` renders that persisted, immutable REVIEW Snapshot — never the draft, no fallback.
  const reviewVersionId = searchParams.get("reviewVersionId");

  const { data, loading } = useAdminQuery<PreviewState>(
    () =>
      reviewVersionId === null
        ? loadPreviewState(projectId, variant, fetchStaffInvitationPreview)
        : fetchReviewVersionPreview(projectId, reviewVersionId).catch(previewErrorState),
    [projectId, variant, reviewVersionId],
  );

  if (loading || data === null) {
    return <FrameMessage text="Đang tải bản xem trước..." />;
  }
  if (data.status !== "READY") {
    return <FrameMessage text="Không thể hiển thị bản xem trước. Xem thông báo ở trang quản trị." />;
  }
  // Staff-only: RSVP is shown with the honest UNAVAILABLE capability (P30 amendment); it never submits.
  return <StaffPreviewRenderer rendererKey={data.rendererKey} viewModel={data.viewModel} sections={data.sections} />;
}

export default function PreviewFramePage() {
  return (
    <Suspense fallback={<FrameMessage text="Đang tải bản xem trước..." />}>
      <PreviewFrame />
    </Suspense>
  );
}
