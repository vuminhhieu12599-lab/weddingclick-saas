"use client";

import Link from "next/link";

import { adminQueries } from "../../../lib/admin/admin-queries";
import { useAdminQuery } from "../../../lib/admin/use-admin-query";
import { DashboardView } from "./_components/dashboard-view";
import { EmptyState, ErrorState, LoadingState } from "./_components/page-states";
import { PageHeader } from "./_components/page-header";
import { SectionHeading } from "./_components/section-heading";
import { ProjectsTable } from "./projects/_components/projects-table";

const RECENT_PROJECTS_COUNT = 5;

export default function AdminDashboardPage() {
  // Totals come from the server aggregate endpoint (exact counts, no 100-row cap).
  const dashboardQuery = adminQueries.dashboard();
  const dashboard = useAdminQuery(dashboardQuery.fetch, [], { cacheKey: dashboardQuery.key });
  // "Dự án gần đây": the existing list endpoint (created_at DESC, id DESC), bounded to 5.
  const recentQuery = adminQueries.projects(RECENT_PROJECTS_COUNT);
  const recent = useAdminQuery(recentQuery.fetch, [], { cacheKey: recentQuery.key });

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        subtitle="Tổng quan hoạt động của các dự án WeddingClick"
        actions={
          // WeddingClick burgundy (--sr-burgundy / deep); navigates to the
          // existing creation route, no logic here.
          <Link
            href="/admin/v2/projects/new"
            className="rounded-lg bg-[#74202f] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#4f1420]"
          >
            Tạo dự án
          </Link>
        }
      />

      {dashboard.loading && <LoadingState />}
      {!dashboard.loading && dashboard.error && <ErrorState message={dashboard.error} onRetry={dashboard.reload} />}
      {!dashboard.loading && !dashboard.error && dashboard.data && <DashboardView dashboard={dashboard.data} />}

      <div className="mt-6">
        <SectionHeading title="Dự án gần đây" hint={`${RECENT_PROJECTS_COUNT} dự án mới nhất`} />
        {recent.loading && <LoadingState />}
        {!recent.loading && recent.error && <ErrorState message={recent.error} onRetry={recent.reload} />}
        {!recent.loading && !recent.error && recent.data &&
          (recent.data.length === 0 ? (
            <EmptyState
              title="Chưa có dự án nào"
              description="Dự án mới sẽ xuất hiện tại đây khi được tạo."
            />
          ) : (
            <ProjectsTable projects={recent.data} presentation="cards" />
          ))}
      </div>
    </div>
  );
}
