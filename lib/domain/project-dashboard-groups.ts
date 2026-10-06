import type { ProjectStatus } from "./project-status";
import type { ProjectTaskStatus } from "./project-task-status";

/**
 * Owner-approved V1 admin dashboard definitions (Task 034C;
 * docs/API_CONTRACT.md §30, docs/DECISIONS.md "Task 034C"). They group the
 * canonical statuses only; they never add new status codes.
 */

/** Not active: everything else (including PUBLISHED) is an active Project. */
export const PROJECT_CLOSED_STATUSES = ["COMPLETED", "ARCHIVED"] as const satisfies readonly ProjectStatus[];

/** "Cần xử lý": the next operational action is on the WeddingClick/staff side. */
export const PROJECT_STAFF_ACTION_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "INTERNAL_REVIEW",
  "REVISION_REQUIRED",
  "APPROVED",
  "READY_TO_PUBLISH",
] as const satisfies readonly ProjectStatus[];

/** "Chờ khách": the next action is on the customer side. */
export const PROJECT_WAITING_FOR_CUSTOMER_STATUSES = [
  "WAITING_FOR_INFO",
  "CUSTOMER_REVIEW",
  "AWAITING_PAYMENT",
] as const satisfies readonly ProjectStatus[];

/** A Project in one of these statuses is never overdue / approaching its deadline. */
export const PROJECT_DEADLINE_CLOSED_STATUSES = ["PUBLISHED", "COMPLETED", "ARCHIVED"] as const satisfies readonly ProjectStatus[];

/** Outstanding task work; DONE and CANCELLED are not outstanding. */
export const OUTSTANDING_TASK_STATUSES = ["TODO", "IN_PROGRESS"] as const satisfies readonly ProjectTaskStatus[];

/** Rolling window for approaching Project deadlines and upcoming tasks. */
export const DASHBOARD_UPCOMING_WINDOW_DAYS = 7;

/** Rolling window for "Hoàn thành 30 ngày". */
export const DASHBOARD_RECENTLY_COMPLETED_DAYS = 30;
