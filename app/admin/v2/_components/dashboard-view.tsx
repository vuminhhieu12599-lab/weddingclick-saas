import Link from "next/link";

import { PROJECT_STATUSES } from "../../../../lib/domain";
import { formatDateTimeVi } from "../../../../lib/presentation/format-date";
import { getProjectStatusLabel } from "../../../../lib/presentation/project-status-labels";
import type { AdminDashboard } from "../../../../lib/server/dashboard/dashboard-types";
import { EmptyState } from "./page-states";
import { StatTile } from "./stat-tile";
import { StatusBadge } from "./status-badge";

/**
 * Tổng quan (Task 034C): compact operational summary computed server-side
 * from the canonical tables. Definitions: docs/API_CONTRACT.md §30.
 */
export function DashboardView({ dashboard }: { dashboard: AdminDashboard }) {
  const { projects, tasks, attention } = dashboard;
  const attentionTotal = projects.overdue + projects.approaching;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Đang hoạt động" value={projects.active} hint="Trừ Hoàn tất và Lưu trữ" />
        <StatTile label="Cần xử lý" value={projects.staffAction} hint="Việc đang ở phía nhân sự" />
        <StatTile label="Chờ khách" value={projects.waitingForCustomer} hint="Chờ thông tin, duyệt hoặc thanh toán" />
        <StatTile label="Quá hạn" value={projects.overdue} hint="Hạn chót đã qua, chưa xuất bản" />
        <StatTile label="Sắp đến hạn" value={projects.approaching} hint="Trong 7 ngày tới" />
        <StatTile label="Hoàn thành 30 ngày" value={projects.recentlyCompleted} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Công việc</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Công việc chưa xong" value={tasks.outstanding} />
          <StatTile label="Công việc quá hạn" value={tasks.overdue} />
          <StatTile label="Công việc 7 ngày tới" value={tasks.upcoming} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Hạn chót cần chú ý</h2>
        {attention.length === 0 ? (
          <EmptyState title="Không có dự án quá hạn hoặc sắp đến hạn." />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {attention.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/admin/v2/projects/${project.id}`}
                    className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-slate-900">{project.projectCode}</span>
                      <StatusBadge status={project.status} />
                    </span>
                    <span className={`text-xs font-medium ${project.overdue ? "text-red-600" : "text-amber-700"}`}>
                      {project.overdue ? "Quá hạn" : "Sắp đến hạn"} · {formatDateTimeVi(project.deadlineAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {attentionTotal > attention.length && (
              <p className="mt-2 text-xs text-slate-500">
                Hiển thị {attention.length} / {attentionTotal} dự án, quá hạn trước, hạn sớm nhất trước.
              </p>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Theo trạng thái</h2>
        <ul className="grid grid-cols-1 gap-x-6 rounded-xl border border-slate-200 bg-white px-4 py-2 sm:grid-cols-2">
          {PROJECT_STATUSES.map((status) => (
            <li key={status} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-b-0">
              <span className="min-w-0 text-slate-600">{getProjectStatusLabel(status)}</span>
              <span className="font-semibold text-slate-900 tabular-nums">{projects.byStatus[status]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
