/** docs/DATABASE.md §7, §24; migration 0005_projects.sql */
export const PAYMENT_STATUSES = ["UNPAID", "PAID"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
