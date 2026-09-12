import { getProjectStatusLabel } from "../../../../../../lib/presentation/project-status-labels";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { EmptyState } from "../../../_components/page-states";

const REVIEW_ACTIVE_STATUSES: ReadonlySet<ProjectSummary["status"]> = new Set([
  "INTERNAL_REVIEW",
  "CUSTOMER_REVIEW",
  "REVISION_REQUIRED",
  "APPROVED",
]);

export function ReviewTab({ project }: { project: ProjectSummary }) {
  const isInReview = REVIEW_ACTIVE_STATUSES.has(project.status);

  return (
    <div className="space-y-4">
      {isInReview && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">Trạng thái duyệt hiện tại</p>
          <p className="mt-1 text-sm font-medium text-slate-800">
            {getProjectStatusLabel(project.status)}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <EmptyState
          title="Chưa có dữ liệu duyệt chi tiết"
          description="Lịch sử phản hồi duyệt và quản lý liên kết Duyệt sẽ hiển thị ở đây khi tính năng Duyệt được triển khai."
        />
      </div>
    </div>
  );
}
