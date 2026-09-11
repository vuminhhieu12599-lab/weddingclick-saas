/**
 * docs/DATABASE.md §6: "Initial code: PERSONALIZED_GUEST" — documented as a
 * stable catalog code. Guest Tool entitlement is derived from the presence
 * of a non-revoked `project_addons` row with this addon code.
 */
export const SERVICE_ADDON_CODES = ["PERSONALIZED_GUEST"] as const;

export type ServiceAddonCode = (typeof SERVICE_ADDON_CODES)[number];
