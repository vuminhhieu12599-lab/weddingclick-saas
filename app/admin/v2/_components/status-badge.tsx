import type { ProjectStatus } from "../../../../lib/domain";
import {
  getProjectStatusLabel,
  getProjectStatusTone,
  type ProjectStatusTone,
} from "../../../../lib/presentation/project-status-labels";

const TONE_CLASSES: Record<ProjectStatusTone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  attention: "bg-purple-50 text-purple-700 ring-purple-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const tone = getProjectStatusTone(status);

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {getProjectStatusLabel(status)}
    </span>
  );
}
