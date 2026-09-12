import { getProjectStatusLabel } from "../../../../../../lib/presentation/project-status-labels";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { EmptyState } from "../../../_components/page-states";

function publishSummary(status: ProjectSummary["status"]): string {
  if (status === "PUBLISHED" || status === "COMPLETED") {
    return "Đã xuất bản";
  }
  if (status === "READY_TO_PUBLISH") {
    return "Sẵn sàng xuất bản — chưa xuất bản";
  }
  return "Chưa đến giai đoạn xuất bản";
}

export function PublishTab({ project }: { project: ProjectSummary }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-slate-400">Trạng thái xuất bản</p>
        <p className="mt-1 text-sm font-medium text-slate-800">{publishSummary(project.status)}</p>
        <p className="mt-1 text-xs text-slate-400">
          Trạng thái dự án: {getProjectStatusLabel(project.status)}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <EmptyState
          title="Chưa có thao tác xuất bản"
          description="Hành động xuất bản/republish sẽ có ở đây khi tính năng Xuất bản được triển khai."
        />
      </div>
    </div>
  );
}
