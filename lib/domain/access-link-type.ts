/** docs/DECISIONS.md "Customer Access Rule"; docs/DATABASE.md §18 */
export const ACCESS_LINK_TYPES = ["INTAKE", "REVIEW", "PORTAL"] as const;

export type AccessLinkType = (typeof ACCESS_LINK_TYPES)[number];
