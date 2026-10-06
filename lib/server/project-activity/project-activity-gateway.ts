import type { ActivityCursor, ProjectActivityRow } from "./project-activity-types";

/**
 * Read-only staff seam over `activity_logs` (migration 0020). Always called
 * with a staff-scoped client, so the `is_staff()` SELECT policy is the real
 * enforcement. There is deliberately no write method: rows are created only
 * by trusted business-action RPCs via the private `log_activity()`.
 */
export interface ProjectActivityGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  /**
   * At most `limit` rows of this Project, ordered `created_at DESC, id DESC`,
   * strictly after `before` when given. Throws on an unknown action/actor type.
   */
  listProjectActivity(
    client: TClient,
    projectId: string,
    options: { before: ActivityCursor | null; limit: number },
  ): Promise<ProjectActivityRow[]>;
}
