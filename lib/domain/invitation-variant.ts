/** docs/DECISIONS.md "Invitation Variants"; docs/DATABASE.md §15, §20 */
export const INVITATION_VARIANTS = ["COMMON", "GROOM", "BRIDE"] as const;

export type InvitationVariant = (typeof INVITATION_VARIANTS)[number];
