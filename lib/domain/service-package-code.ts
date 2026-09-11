/**
 * docs/DATABASE.md §5: "Initial package codes: COMMON, SEPARATE" — documented
 * as stable catalog codes, distinct from InvitationVariant (a SEPARATE
 * package entitles a Project to GROOM + BRIDE invitation variants).
 */
export const SERVICE_PACKAGE_CODES = ["COMMON", "SEPARATE"] as const;

export type ServicePackageCode = (typeof SERVICE_PACKAGE_CODES)[number];
