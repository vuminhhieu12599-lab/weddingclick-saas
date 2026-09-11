/** docs/DATABASE.md §17, §24 */
export const INTAKE_SUBMISSION_STATUSES = ["PENDING", "APPLIED", "REJECTED"] as const;

export type IntakeSubmissionStatus = (typeof INTAKE_SUBMISSION_STATUSES)[number];
