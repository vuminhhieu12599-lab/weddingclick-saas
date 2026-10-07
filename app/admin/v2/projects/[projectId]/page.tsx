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

  // Only the first load (or a different projectId) replaces the page: a
  // background reload after a Publish-tab mutation keeps the workspace mounted
  // so its active tab survives while the authoritative summary is re-read.
  if (loading && project?.id !== projectId) {
    return <LoadingState label="Đang tải dự án..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  if (!project) {
    return null;
  }

  return (
    <div>
      <ProjectHeader project={project} />
      <div className="mt-6">
        <Lifecycle status={project.status} />
      </div>
      <WorkspaceTabs project={project} initialTab={initialTab} onProjectChanged={reload} />
    </div>
  );
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<LoadingState label="Đang tải dự án..." />}>
      <ProjectDetail />
    </Suspense>
  );
}
