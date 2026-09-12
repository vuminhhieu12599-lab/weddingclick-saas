"use client";

import { fetchProjects, PROJECT_LIST_LIMIT } from "../../../../lib/admin/admin-api-client";
import { useAdminQuery } from "../../../../lib/admin/use-admin-query";
import { EmptyState, ErrorState, LoadingState } from "../_components/page-states";
import { PageHeader } from "../_components/page-header";
import { ProjectsTable } from "./_components/projects-table";

export default function ProjectsListPage() {
  const { data: projects, loading, error, reload } = useAdminQuery(() => fetchProjects(), []);

  return (
    <div>
      <PageHeader
        title="Dự án"
        subtitle={
          projects && projects.length >= PROJECT_LIST_LIMIT
            ? `Hiển thị ${PROJECT_LIST_LIMIT} dự án được tạo gần nhất`
            : "Toàn bộ dự án WeddingClick"
        }
      />

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && projects && (
        <>
          {projects.length === 0 ? (
            <EmptyState
              title="Chưa có dự án nào"
              description="Dự án mới sẽ xuất hiện tại đây khi được tạo."
            />
          ) : (
            <ProjectsTable projects={projects} />
          )}
        </>
      )}
    </div>
  );
}
