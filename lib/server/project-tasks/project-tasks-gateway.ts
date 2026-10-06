import type {
  AssignableStaffRecord,
  ProjectTaskInput,
  ProjectTaskPatch,
  ProjectTaskRecord,
} from "./project-task-types";

/**
 * Staff seam over `project_tasks` (migration 0019) and the minimal
 * `profiles` lookup it needs. Always called with a staff-scoped client, so
 * the `is_staff()` RLS policies are the real enforcement — never an
 * elevated credential. Every write is one plain RLS statement scoped by
 * `project_id` (and `id`), so another Project's row can never be touched.
 */
export interface ProjectTasksGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  /** Ordered sort_order ASC, due_at ASC NULLS LAST, created_at ASC, id ASC. No rows is `[]`. */
  listProjectTasks(client: TClient, projectId: string): Promise<ProjectTaskRecord[]>;
  insertProjectTask(client: TClient, projectId: string, input: ProjectTaskInput): Promise<ProjectTaskRecord>;
  /** `null` when no row with this id belongs to the Project. */
  updateProjectTask(
    client: TClient,
    projectId: string,
    taskId: string,
    patch: ProjectTaskPatch,
  ): Promise<ProjectTaskRecord | null>;
  /** `false` when no row with this id belongs to the Project. */
  deleteProjectTask(client: TClient, projectId: string, taskId: string): Promise<boolean>;
  /** `true` only for an existing, active STAFF/ADMIN profile. */
  isActiveStaffProfile(client: TClient, profileId: string): Promise<boolean>;
  /** Active STAFF/ADMIN profiles (id + display_name only), ordered by display name. */
  listAssignableStaff(client: TClient): Promise<AssignableStaffRecord[]>;
}
