import { PROJECT_STATUSES, type ProjectStatus } from "../domain";

/**
 * Central Vietnamese label + badge tone mapping for `ProjectStatus`
 * (PRODUCT.md §"...UI may use friendly Vietnamese labels, but internal
 * values must remain centralized and typed"). Every admin surface must
 * import from here rather than redefining status copy locally.
 */
export type ProjectStatusTone =
  | "neutral"
  | "info"
  | "warning"
  | "attention"
  | "success"
  | "danger";

const PROJECT_STATUS_LABELS_VI: Record<ProjectStatus, string> = {
  NEW: "Mới",
  WAITING_FOR_INFO: "Chờ thông tin",
  IN_PROGRESS: "Đang thực hiện",
  INTERNAL_REVIEW: "Duyệt nội bộ",
  CUSTOMER_REVIEW: "Khách đang duyệt",
  REVISION_REQUIRED: "Cần chỉnh sửa",
  APPROVED: "Đã duyệt",
  AWAITING_PAYMENT: "Chờ thanh toán",
  READY_TO_PUBLISH: "Sẵn sàng xuất bản",
  PUBLISHED: "Đã xuất bản",
  COMPLETED: "Hoàn tất",
  ARCHIVED: "Lưu trữ",
};

const PROJECT_STATUS_TONES: Record<ProjectStatus, ProjectStatusTone> = {
  NEW: "neutral",
  WAITING_FOR_INFO: "warning",
  IN_PROGRESS: "info",
  INTERNAL_REVIEW: "info",
  CUSTOMER_REVIEW: "attention",
  REVISION_REQUIRED: "danger",
  APPROVED: "success",
  AWAITING_PAYMENT: "warning",
  READY_TO_PUBLISH: "info",
  PUBLISHED: "success",
  COMPLETED: "success",
  ARCHIVED: "neutral",
};

/** Statuses that represent work currently sitting with WeddingClick staff. */
const STATUSES_NEEDING_STAFF_ATTENTION: readonly ProjectStatus[] = [
  "NEW",
  "WAITING_FOR_INFO",
  "IN_PROGRESS",
  "REVISION_REQUIRED",
  "AWAITING_PAYMENT",
];

export function getProjectStatusLabel(status: ProjectStatus): string {
  return PROJECT_STATUS_LABELS_VI[status];
}

export function getProjectStatusTone(status: ProjectStatus): ProjectStatusTone {
  return PROJECT_STATUS_TONES[status];
}

export function isStatusNeedingStaffAttention(status: ProjectStatus): boolean {
  return STATUSES_NEEDING_STAFF_ATTENTION.includes(status);
}

/** Ordered lifecycle, re-exported so UI never redefines the sequence. */
export const PROJECT_STATUS_SEQUENCE: readonly ProjectStatus[] = PROJECT_STATUSES;
