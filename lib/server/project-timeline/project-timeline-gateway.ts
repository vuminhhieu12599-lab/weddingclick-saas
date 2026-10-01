import type { ProjectTimelineItemRecord } from "./project-timeline-types";

/**
 * Small seam (mirrors ProjectEventsGateway / MediaGateway) over the real
 * @supabase/supabase-js client. Always called with a staff-scoped client
 * (createStaffSupabaseClient), so the `is_staff()` RLS policies of migration
 * 0029 are the real enforcement — never an elevated credential.
 */
export interface ProjectTimelineGateway<TClient> {
  /**
   * Every `project_timeline_items` row of the Project, ordered sort_order
   * ASC, then id ASC, with `time` already canonical `HH:mm`. No rows is `[]`;
   * a query failure or malformed row throws (never an empty Timeline).
   */
  listProjectTimelineItems(client: TClient, projectId: string): Promise<ProjectTimelineItemRecord[]>;
}
