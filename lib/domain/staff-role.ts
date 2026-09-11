/** docs/DATABASE.md §3, §24; migration 0002_profiles.sql */
export const STAFF_ROLES = ["ADMIN", "STAFF"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
