import type { DashboardDeadlineProject, DashboardProjectFilter, DashboardTaskFilter } from "./dashboard-types";

/**
 * Read-only staff seam for the admin dashboard (Task 034C) over the
 * canonical `projects` and `project_tasks` tables. Always called with a
 * staff-scoped client (staff RLS). Counts never transfer rows; the list is
 * bounded. The dashboard semantics live in the use case, not here.
 */
export interface DashboardGateway<TClient> {
  countProjects(client: TClient, filter: DashboardProjectFilter): Promise<number>;
  countTasks(client: TClient, filter: DashboardTaskFilter): Promise<number>;
  /** Ordered deadline_at ASC, id ASC; at most `limit` rows. */
  listDeadlineProjects(
    client: TClient,
    filter: DashboardProjectFilter & { deadlineAt: NonNullable<DashboardProjectFilter["deadlineAt"]> },
    limit: number,
  ): Promise<DashboardDeadlineProject[]>;
}
