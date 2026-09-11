/** docs/DATABASE.md §11; docs/PHYSICAL_DATABASE_PLAN.md §2.9 */
export const MEDIA_TYPES = ["COVER", "GALLERY", "AUDIO", "QR_GROOM", "QR_BRIDE", "QR_COMMON"] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];
