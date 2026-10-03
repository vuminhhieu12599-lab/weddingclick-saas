"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { fetchStaffInvitationPreview } from "../../../../../../lib/admin/admin-api-client";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import { LoadingState } from "../../../_components/page-states";
import { loadPreviewState, parsePreviewVariant } from "./_components/preview-state";
import { StaffPreviewView, type PreviewWidth } from "./_components/preview-view";

/**
 * Staff-only, read-only invitation preview. Runs inside the `/admin/v2`
 * staff guard; the data comes only from the staff preview Route Handler
 * (`requireStaff` + the frozen `buildStaffInvitationPreview`). The variant
 * lives only in the URL and is never persisted.
 */
function ProjectPreview() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const variant = parsePreviewVariant(useSearchParams().get("variant"));
  const [width, setWidth] = useState<PreviewWidth>("MOBILE");

  const { data, loading, reload } = useAdminQuery(
    () => loadPreviewState(projectId, variant, fetchStaffInvitationPreview),
    [projectId, variant],
  );

  return (
    <StaffPreviewView
      projectId={projectId}
      variant={variant}
      state={data}
      loading={loading}
      onRetry={reload}
      width={width}
      onWidthChange={setWidth}
    />
  );
}

export default function ProjectPreviewPage() {
  return (
    <Suspense fallback={<LoadingState label="Đang tạo bản xem trước..." />}>
      <ProjectPreview />
    </Suspense>
  );
}
