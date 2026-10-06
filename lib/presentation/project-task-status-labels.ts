import { PROJECT_TASK_STATUSES, type ProjectTaskStatus } from "../domain";

/**
 * Central Vietnamese labels for `ProjectTaskStatus` (Task 034A). The
 * canonical English codes are what the API/DB persist; these labels are
 * display-only.
 */
const PROJECT_TASK_STATUS_LABELS_VI: Record<ProjectTaskStatus, string> = {
  TODO: "Chưa làm",
  IN_PROGRESS: "Đang làm",
  DONE: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

export function getProjectTaskStatusLabel(status: ProjectTaskStatus): string {
  return PROJECT_TASK_STATUS_LABELS_VI[status];
}

export const PROJECT_TASK_STATUS_OPTIONS: readonly { value: ProjectTaskStatus; label: string }[] =
  PROJECT_TASK_STATUSES.map((value) => ({ value, label: PROJECT_TASK_STATUS_LABELS_VI[value] }));
