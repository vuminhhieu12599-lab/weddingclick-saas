/**
 * docs/DATABASE.md §10: named `occasion_type`, not `event_type`, to avoid
 * colliding with the unrelated top-level EventType concept (WEDDING today).
 */
export const OCCASION_TYPES = ["VU_QUY", "THANH_HON", "RECEPTION", "CUSTOM"] as const;

export type OccasionType = (typeof OCCASION_TYPES)[number];
