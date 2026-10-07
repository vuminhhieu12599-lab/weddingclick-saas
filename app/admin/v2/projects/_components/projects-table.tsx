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
 *
 * Below md a 7-column table cannot fit a 360–430px phone, so the same
 * `projects` are rendered as stacked cards instead (CSS-only switch, no
 * viewport detection); md+ keeps the table unchanged.
 */
export function ProjectsTable({ projects }: { projects: ProjectSummary[] }) {
  return (
    <>
      <ul className="space-y-3 md:hidden" data-projects-mobile-list>
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </ul>
      <ProjectsDesktopTable projects={projects} />
    </>
  );
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-700">{value}</dd>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4" data-project-card={project.id}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words font-semibold text-slate-900">{project.projectCode}</p>
        <div className="shrink-0">
          <StatusBadge status={project.status} />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2 min-w-0">
          <dt className="text-xs uppercase tracking-wide text-slate-400">Khách hàng</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{project.customer.displayName}</dd>
        </div>
        <CardField label="Gói dịch vụ" value={getPackageLabel(project.packageCodeSnapshot, project.packageNameSnapshot)} />
        <CardField label="Tổng giá trị" value={formatVnd(project.totalPriceVnd)} />
        <CardField label="Hạn hoàn thành" value={formatDateVi(project.deadlineAt)} />
        <CardField label="Phụ trách" value={getAssignedStaffLabel(project.assignedStaff)} />
      </dl>
      <Link
        href={`/admin/v2/projects/${project.id}`}
        className="mt-4 block rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        Mở dự án
      </Link>
    </li>
  );
}

function ProjectsDesktopTable({ projects }: { projects: ProjectSummary[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block" data-projects-desktop-table>
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
