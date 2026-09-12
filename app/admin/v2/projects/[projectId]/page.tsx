"use client";

import { useParams } from "next/navigation";

import { fetchProjectById } from "../../../../../lib/admin/admin-api-client";
import { useAdminQuery } from "../../../../../lib/admin/use-admin-query";
import { ErrorState, LoadingState } from "../../_components/page-states";
import { Lifecycle } from "./_components/lifecycle";
import { ProjectHeader } from "./_components/project-header";
import { WorkspaceTabs } from "./_components/workspace-tabs";

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const {
    data: project,
    loading,
    error,
    reload,
  } = useAdminQuery(() => fetchProjectById(projectId), [projectId]);

  if (loading) {
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
      <WorkspaceTabs project={project} />
    </div>
  );
}
