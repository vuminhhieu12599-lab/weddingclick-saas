/** docs/DATABASE.md §21; docs/PHYSICAL_DATABASE_PLAN.md §2.20 */
export const RSVP_ATTENDANCE_STATUSES = ["ATTENDING", "NOT_ATTENDING"] as const;

export type RsvpAttendanceStatus = (typeof RSVP_ATTENDANCE_STATUSES)[number];
