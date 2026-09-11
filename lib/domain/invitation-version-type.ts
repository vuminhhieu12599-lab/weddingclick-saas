/** docs/DATABASE.md §16; docs/PHYSICAL_DATABASE_PLAN.md §2.14 */
export const INVITATION_VERSION_TYPES = ["REVIEW", "PUBLISHED"] as const;

export type InvitationVersionType = (typeof INVITATION_VERSION_TYPES)[number];
