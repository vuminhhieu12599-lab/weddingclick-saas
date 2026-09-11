/** docs/DATABASE.md §7, §24; migration 0005_projects.sql. V1 supports only WEDDING. */
export const EVENT_TYPES = ["WEDDING"] as const;

export type EventType = (typeof EVENT_TYPES)[number];
