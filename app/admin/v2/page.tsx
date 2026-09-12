"use client";

import { fetchProjects, PROJECT_LIST_LIMIT } from "../../../lib/admin/admin-api-client";
import { useAdminQuery } from "../../../lib/admin/use-admin-query";
import { isStatusNeedingStaffAttention } from "../../../lib/presentation/project-status-labels";
import { EmptyState, ErrorState, LoadingState } from "./_components/page-states";
import { PageHeader } from "./_components/page-header";
import { StatTile } from "./_components/stat-tile";
import { ProjectsTable } from "./projects/_components/projects-table";

const RECENT_PROJECTS_COUNT = 5;

export default function AdminDashboardPage() {
  const { data: projects, loading, error, reload } = useAdminQuery(() => fetchProjects(), []);

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        subtitle="Tổng quan hoạt động của các dự án WeddingClick"
      />

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && projects && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Tổng số dự án"
              value={projects.length}
              hint={
                projects.length >= PROJECT_LIST_LIMIT
                  ? `Đang hiển thị ${PROJECT_LIST_LIMIT} dự án gần nhất`
                  : undefined
              }
            />
            <StatTile
              label="Cần xử lý"
              value={projects.filter((p) => isStatusNeedingStaffAttention(p.status)).length}
              hint="Đang chờ nhân sự thao tác"
            />
            <StatTile
              label="Khách đang duyệt"
              value={projects.filter((p) => p.status === "CUSTOMER_REVIEW").length}
            />
            <StatTile
              label="Đã xuất bản"
              value={projects.filter((p) => p.status === "PUBLISHED").length}
            />
          </div>

          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Dự án gần đây</h2>
            {projects.length === 0 ? (
              <EmptyState
                title="Chưa có dự án nào"
                description="Dự án mới sẽ xuất hiện tại đây khi được tạo."
              />
            ) : (
              <ProjectsTable projects={projects.slice(0, RECENT_PROJECTS_COUNT)} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
