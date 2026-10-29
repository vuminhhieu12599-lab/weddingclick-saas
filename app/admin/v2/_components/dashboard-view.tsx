import Link from "next/link";

import { PROJECT_STATUSES } from "../../../../lib/domain";
import { formatDateTimeVi } from "../../../../lib/presentation/format-date";
import {
  getProjectStatusLabel,
  getProjectStatusTone,
  type ProjectStatusTone,
} from "../../../../lib/presentation/project-status-labels";
import type { AdminDashboard } from "../../../../lib/server/dashboard/dashboard-types";
import { EmptyState } from "./page-states";
import { SectionHeading } from "./section-heading";
import { StatTile } from "./stat-tile";
import { StatusBadge } from "./status-badge";

/** Status-dot accent, derived from the central badge tone so the two agree. */
const STATUS_DOT_CLASSES: Record<ProjectStatusTone, string> = {
  neutral: "bg-slate-300",
  info: "bg-blue-400",
  warning: "bg-amber-400",
  attention: "bg-purple-400",
  success: "bg-emerald-400",
  danger: "bg-red-400",
};

/**
 * Tổng quan (Task 034C): compact operational summary computed server-side
 * from the canonical tables. Definitions: docs/API_CONTRACT.md §30.
 *
 * Layout only: every block is full width and sized to its own content, so no
 * panel is stretched to a neighbour's height. Extra width goes into more
 * columns inside a block (tiles 2 → 3 → 6, status chips 1 → 2 → 3 → 4) rather
 * than into a side-by-side split, which at 1024px left dead space behind.
 */
export function DashboardView({ dashboard }: { dashboard: AdminDashboard }) {
  const { projects, tasks, attention } = dashboard;
  const attentionTotal = projects.overdue + projects.approaching;

  return (
    <div className="space-y-5">
      <section>
        <SectionHeading title="Dự án" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Đang hoạt động" value={projects.active} hint="Trừ Hoàn tất và Lưu trữ" />
          <StatTile label="Cần xử lý" value={projects.staffAction} hint="Việc đang ở phía nhân sự" />
          <StatTile label="Chờ khách" value={projects.waitingForCustomer} hint="Chờ thông tin, duyệt hoặc thanh toán" />
          <StatTile label="Quá hạn" value={projects.overdue} hint="Hạn chót đã qua, chưa xuất bản" tone="danger" />
          <StatTile label="Sắp đến hạn" value={projects.approaching} hint="Trong 7 ngày tới" tone="warning" />
          <StatTile label="Hoàn thành 30 ngày" value={projects.recentlyCompleted} />
        </div>
      </section>

      <section>
        <SectionHeading title="Công việc" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Công việc chưa xong" value={tasks.outstanding} />
          <StatTile label="Công việc quá hạn" value={tasks.overdue} tone="danger" />
          <StatTile label="Công việc 7 ngày tới" value={tasks.upcoming} tone="warning" />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Hạn chót cần chú ý"
          hint={
            attentionTotal > attention.length
              ? `Hiển thị ${attention.length} / ${attentionTotal} dự án, quá hạn trước, hạn sớm nhất trước.`
              : undefined
          }
        />
        {attention.length === 0 ? (
          <EmptyState
            title="Không có dự án quá hạn hoặc sắp đến hạn."
            description="Hạn chót quá hạn hoặc trong 7 ngày tới sẽ xuất hiện tại đây."
          />
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {attention.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/admin/v2/projects/${project.id}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-slate-50"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-slate-900">{project.projectCode}</span>
                    <StatusBadge status={project.status} />
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${
                        project.overdue
                          ? "bg-red-50 text-red-700 ring-red-200"
                          : "bg-amber-50 text-amber-700 ring-amber-200"
                      }`}
                    >
                      {project.overdue ? "Quá hạn" : "Sắp đến hạn"}
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-slate-500">
                      {formatDateTimeVi(project.deadlineAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading title="Theo trạng thái" />
        <ul className="grid grid-cols-1 gap-1.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PROJECT_STATUSES.map((status) => (
            <li key={status} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASSES[getProjectStatusTone(status)]}`}
                />
                <span className="truncate text-[13px] text-slate-600">{getProjectStatusLabel(status)}</span>
              </span>
              <span
                className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                  projects.byStatus[status] > 0 ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {projects.byStatus[status]}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
