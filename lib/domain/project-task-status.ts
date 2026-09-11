/** docs/DATABASE.md §22; docs/PHYSICAL_DATABASE_PLAN.md §2.21 */
export const PROJECT_TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const;

export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number];
