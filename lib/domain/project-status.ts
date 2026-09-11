/** docs/DECISIONS.md "Project Lifecycle"; migration 0005_projects.sql */
export const PROJECT_STATUSES = [
  "NEW",
  "WAITING_FOR_INFO",
  "IN_PROGRESS",
  "INTERNAL_REVIEW",
  "CUSTOMER_REVIEW",
  "REVISION_REQUIRED",
  "APPROVED",
  "AWAITING_PAYMENT",
  "READY_TO_PUBLISH",
  "PUBLISHED",
  "COMPLETED",
  "ARCHIVED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
