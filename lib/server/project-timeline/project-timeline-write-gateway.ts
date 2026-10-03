import type { ProjectTimelineItemRecord } from "./project-timeline-types";

/** Validated values for one new `project_timeline_items` row. */
export interface ProjectTimelineItemInput {
  /** Canonical `HH:mm` (minute precision). */
  time: string;
  label: string;
  sortOrder: number;
}

/** Field-presence preserving patch: only the keys present are written. */
export type ProjectTimelineItemPatch = Partial<ProjectTimelineItemInput>;

/**
 * Staff write seam over `project_timeline_items` (migration 0029). Always
 * called with a staff-scoped client, so the `is_staff()` RLS policies are the
 * real enforcement — never an elevated credential. Every write is one plain
 * RLS statement scoped by `project_id` (and `id`), so another Project's row
 * can never be touched.
 */
export interface ProjectTimelineWriteGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  insertTimelineItem(
    client: TClient,
    projectId: string,
    input: ProjectTimelineItemInput,
  ): Promise<ProjectTimelineItemRecord>;
  /** `null` when no row with this id belongs to the Project. */
  updateTimelineItem(
    client: TClient,
    projectId: string,
    itemId: string,
    patch: ProjectTimelineItemPatch,
  ): Promise<ProjectTimelineItemRecord | null>;
  /** `false` when no row with this id belongs to the Project. */
  deleteTimelineItem(client: TClient, projectId: string, itemId: string): Promise<boolean>;
}
