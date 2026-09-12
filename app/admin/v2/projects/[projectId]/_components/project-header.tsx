import { getAssignedStaffLabel } from "../../../../../../lib/presentation/assigned-staff";
import { formatDateVi } from "../../../../../../lib/presentation/format-date";
import { formatVnd } from "../../../../../../lib/presentation/format-vnd";
import { getPackageLabel } from "../../../../../../lib/presentation/service-catalog-labels";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { StatusBadge } from "../../../_components/status-badge";

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

export function ProjectHeader({ project }: { project: ProjectSummary }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Mã dự án</p>
          <h1 className="text-lg font-semibold text-slate-900">{project.projectCode}</h1>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
