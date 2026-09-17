import type {
  CreateProjectEventResult,
  ProjectEventInput,
  ProjectEventRecord,
  UpdateProjectEventResult,
} from "./project-events-types";

/**
 * Small seam (Task 023, mirrors Task 022's WeddingDetailsGateway pattern)
 * that decouples Project Event use cases from the real
 * @supabase/supabase-js client shape.
 *
 * `projectExists`/`listProjectEvents` are plain DIRECT RLS reads
 * (API_CONTRACT.md §3.1) — called with a staff-scoped client so
 * `projects`/`project_events` RLS (`is_staff()`) remains the real
 * enforcement.
 *
 * `createProjectEvent`/`updateProjectEvent`/`deleteProjectEvent` call the
 * create_project_event / update_project_event / delete_project_event
 * TRUSTED BUSINESS ACTION RPCs
 * (supabase/migrations/..._0022_project_events_actions.sql) — never a plain
 * RLS INSERT/UPDATE/DELETE (API_CONTRACT.md §3.1 table).
 */
export interface ProjectEventsGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  listProjectEvents(client: TClient, projectId: string): Promise<ProjectEventRecord[]>;
  createProjectEvent(
    client: TClient,
    projectId: string,
    input: ProjectEventInput,
  ): Promise<CreateProjectEventResult>;
  updateProjectEvent(
    client: TClient,
    projectId: string,
    eventId: string,
    input: ProjectEventInput,
  ): Promise<UpdateProjectEventResult>;
  deleteProjectEvent(client: TClient, projectId: string, eventId: string): Promise<void>;
}
