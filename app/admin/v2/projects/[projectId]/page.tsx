"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { fetchProjectById } from "../../../../../lib/admin/admin-api-client";
import { useAdminQuery } from "../../../../../lib/admin/use-admin-query";
import { ErrorState, LoadingState } from "../../_components/page-states";
import { Lifecycle } from "./_components/lifecycle";
import { ProjectHeader } from "./_components/project-header";
import { parseWorkspaceTab, WorkspaceTabs } from "./_components/workspace-tabs";

function ProjectDetail() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const initialTab = parseWorkspaceTab(useSearchParams().get("tab"));

  const {
    data: project,
    loading,
    error,
    reload,
  } = useAdminQuery(() => fetchProjectById(projectId), [projectId]);

  // Only a summary for the CURRENT route projectId may be rendered. Without
  // one (first load, or a stale summary from a different projectId) loading
  // and error states replace the page. With one, a background reload after a
  // Publish-tab mutation — and a failure of that reload — keeps the workspace
  // mounted so its active tab survives; the summary is shown only as
  // last-known data until fetchProjectById succeeds again.
  const hasCurrentProject = project?.id === projectId;

  if (!hasCurrentProject) {
    if (loading) {
      return <LoadingState label="Đang tải dự án..." />;
    }
    if (error) {
      return <ErrorState message={error} onRetry={reload} />;
    }
    return null;
  }

  return (
    <div>
      <ProjectRefreshNotice loading={loading} error={error} onRetry={reload} />
      <ProjectHeader project={project} />
      <div className="mt-6">
        <Lifecycle status={project.status} />
      </div>
      <WorkspaceTabs project={project} initialTab={initialTab} onProjectChanged={reload} />
    </div>
  );
}

/** Compact, non-blocking state of a background re-read of the current Project summary. */
function ProjectRefreshNotice({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <p role="status" className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Đang đồng bộ trạng thái dự án...
      </p>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
      >
        <p>Không thể đồng bộ trạng thái dự án. Thông tin trạng thái bên dưới có thể chưa mới nhất.</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-sm font-medium text-amber-800 hover:bg-amber-100"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return null;
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<LoadingState label="Đang tải dự án..." />}>
      <ProjectDetail />
    </Suspense>
  );
}
