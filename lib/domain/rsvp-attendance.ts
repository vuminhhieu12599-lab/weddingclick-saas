/**
 * docs/DATABASE.md §21; docs/PHYSICAL_DATABASE_PLAN.md §2.20. MAYBE ("Sẽ cố
 * gắng tham dự") added by the RSVP completion amendment (migration 0032).
 * Order is the presentation order of the choices.
 */
export const RSVP_ATTENDANCE_STATUSES = ["ATTENDING", "MAYBE", "NOT_ATTENDING"] as const;

export type RsvpAttendanceStatus = (typeof RSVP_ATTENDANCE_STATUSES)[number];
