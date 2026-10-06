"use client";

import { fetchAdminDashboard, fetchProjects } from "../../../lib/admin/admin-api-client";
import { useAdminQuery } from "../../../lib/admin/use-admin-query";
import { DashboardView } from "./_components/dashboard-view";
import { EmptyState, ErrorState, LoadingState } from "./_components/page-states";
import { PageHeader } from "./_components/page-header";
import { ProjectsTable } from "./projects/_components/projects-table";

const RECENT_PROJECTS_COUNT = 5;

export default function AdminDashboardPage() {
  // Totals come from the server aggregate endpoint (exact counts, no 100-row cap).
  const dashboard = useAdminQuery(() => fetchAdminDashboard(), []);
  // "Dự án gần đây": the existing list endpoint (created_at DESC, id DESC), bounded to 5.
  const recent = useAdminQuery(() => fetchProjects({ limit: RECENT_PROJECTS_COUNT }), []);

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        subtitle="Tổng quan hoạt động của các dự án WeddingClick"
      />

      {dashboard.loading && <LoadingState />}
      {!dashboard.loading && dashboard.error && <ErrorState message={dashboard.error} onRetry={dashboard.reload} />}
      {!dashboard.loading && !dashboard.error && dashboard.data && <DashboardView dashboard={dashboard.data} />}

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Dự án gần đây</h2>
        {recent.loading && <LoadingState />}
        {!recent.loading && recent.error && <ErrorState message={recent.error} onRetry={recent.reload} />}
        {!recent.loading && !recent.error && recent.data &&
          (recent.data.length === 0 ? (
            <EmptyState
              title="Chưa có dự án nào"
              description="Dự án mới sẽ xuất hiện tại đây khi được tạo."
            />
          ) : (
            <ProjectsTable projects={recent.data} />
          ))}
      </div>
    </div>
  );
}
