import Link from "next/link";

import { getAssignedStaffLabel } from "../../../../../lib/presentation/assigned-staff";
import { formatDateVi } from "../../../../../lib/presentation/format-date";
import { formatVnd } from "../../../../../lib/presentation/format-vnd";
import { getPackageLabel } from "../../../../../lib/presentation/service-catalog-labels";
import type { ProjectSummary } from "../../../../../lib/server/projects/project-types";
import { StatusBadge } from "../../_components/status-badge";

/**
 * `table-fixed` + explicit column widths (rather than `min-w-full` +
 * `whitespace-nowrap` on every cell) so long customer/package/staff values
 * wrap within their column instead of forcing the table wider than its
 * container — that intrinsic-width growth was what produced a horizontal
 * scrollbar at normal desktop widths.
 *
 * `createdAt` is intentionally not a column here — it's lower priority than
 * the other seven fields and already shown on Project Detail — dropping it
 * frees enough width for the remaining columns (customer/package/assigned
 * staff especially) to stay readable without reintroducing overflow.
 */
export function ProjectsTable({ projects }: { projects: ProjectSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full table-fixed divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400">
            <th scope="col" className="w-[11%] px-4 py-3">
              Mã dự án
            </th>
            <th scope="col" className="w-[20%] px-4 py-3">
              Khách hàng
            </th>
            <th scope="col" className="w-[12%] px-4 py-3">
              Trạng thái
            </th>
            <th scope="col" className="w-[19%] px-4 py-3">
              Gói dịch vụ
            </th>
            <th scope="col" className="w-[13%] px-4 py-3">
              Tổng giá trị
            </th>
            <th scope="col" className="w-[10%] px-4 py-3">
              Hạn hoàn thành
            </th>
            <th scope="col" className="w-[15%] px-4 py-3">
              Phụ trách
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {projects.map((project) => (
            <tr key={project.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 align-top">
                <Link
                  href={`/admin/v2/projects/${project.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {project.projectCode}
                </Link>
              </td>
              <td className="break-words px-4 py-3 align-top text-slate-600">
                {project.customer.displayName}
              </td>
              <td className="px-4 py-3 align-top">
                <StatusBadge status={project.status} />
              </td>
              <td className="break-words px-4 py-3 align-top text-slate-600">
                {getPackageLabel(project.packageCodeSnapshot, project.packageNameSnapshot)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 align-top text-slate-600">
                {formatVnd(project.totalPriceVnd)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 align-top text-slate-600">
                {formatDateVi(project.deadlineAt)}
              </td>
              <td className="break-words px-4 py-3 align-top text-slate-600">
                {getAssignedStaffLabel(project.assignedStaff)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
