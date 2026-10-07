import Link from "next/link";

import { getAssignedStaffLabel } from "../../../../../../lib/presentation/assigned-staff";
import { formatDateVi } from "../../../../../../lib/presentation/format-date";
import { formatVnd } from "../../../../../../lib/presentation/format-vnd";
import { getPackageLabel } from "../../../../../../lib/presentation/service-catalog-labels";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { StatusBadge } from "../../../_components/status-badge";

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

export function ProjectHeader({ project }: { project: ProjectSummary }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-400">Mã dự án</p>
          <h1 className="break-words text-lg font-semibold text-slate-900">{project.projectCode}</h1>
        </div>
        <div className="flex flex-row-reverse items-center justify-between gap-3 sm:flex-row sm:justify-end" data-header-actions>
          <Link
            href={`/admin/v2/projects/${encodeURIComponent(project.id)}/preview`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:py-1.5"
          >
            Xem trước thiệp
          </Link>
          <StatusBadge status={project.status} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:mt-5 sm:grid-cols-3 lg:grid-cols-6">
        <HeaderField label="Khách hàng" value={project.customer.displayName} />
        <HeaderField
          label="Gói dịch vụ"
          value={getPackageLabel(project.packageCodeSnapshot, project.packageNameSnapshot)}
        />
        <HeaderField label="Tổng giá trị" value={formatVnd(project.totalPriceVnd)} />
        <HeaderField label="Hạn hoàn thành" value={formatDateVi(project.deadlineAt)} />
        <HeaderField label="Phụ trách" value={getAssignedStaffLabel(project.assignedStaff)} />
        <HeaderField label="Ngày tạo" value={formatDateVi(project.createdAt)} />
      </div>
    </div>
  );
}
