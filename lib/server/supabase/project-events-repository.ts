import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventSide, OccasionType } from "../../domain";
import { ApiError } from "../errors/api-error";
import { PROJECT_EVENTS_RPC_ERROR_CODES } from "../project-events/project-events-rpc-error-codes";
import type { ProjectEventsGateway } from "../project-events/project-events-gateway";
import type {
  CreateProjectEventResult,
  ProjectEventInput,
  ProjectEventRecord,
  UpdateProjectEventResult,
} from "../project-events/project-events-types";

/**
 * Production ProjectEventsGateway (Task 023): the only place in this
 * feature that issues real @supabase/supabase-js calls. Always invoked with
 * a staff-scoped client (Task 004's createStaffSupabaseClient), so
 * `projects`/`project_events` RLS remains the real enforcement for reads —
 * this module never uses the privileged (elevated-access) Supabase
 * credential. Create/update/delete call the create_project_event /
 * update_project_event / delete_project_event RPCs (business actions),
 * never a plain `.from("project_events").insert/update/delete(...)`.
 */
interface ProjectEventRow {
  id: string;
  project_id: string;
  occasion_type: string;
  side: string;
  title: string;
  starts_at: string;
  timezone: string;
  venue_name: string | null;
  address: string | null;
  map_url: string | null;
  description: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

const PROJECT_EVENT_COLUMNS =
  "id, project_id, occasion_type, side, title, starts_at, timezone, venue_name, " +
  "address, map_url, description, sort_order, is_primary, created_at, updated_at";

function toProjectEventRecord(row: ProjectEventRow): ProjectEventRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    occasionType: row.occasion_type as OccasionType,
    side: row.side as EventSide,
    title: row.title,
    startsAt: row.starts_at,
    timezone: row.timezone,
    venueName: row.venue_name,
    address: row.address,
    mapUrl: row.map_url,
    description: row.description,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRpcInput(input: ProjectEventInput) {
  return {
    p_occasion_type: input.occasionType,
    p_side: input.side,
    p_title: input.title,
    p_starts_at: input.startsAt,
    p_timezone: input.timezone,
    p_venue_name: input.venueName,
    p_address: input.address,
    p_map_url: input.mapUrl,
    p_description: input.description,
    p_sort_order: input.sortOrder,
    p_is_primary: input.isPrimary,
  };
}

/** create_project_event RPC row shape — the project_events columns above. */
type CreateProjectEventRpcRow = ProjectEventRow;

/**
 * update_project_event RPC row shape — the project_events columns above
 * plus `changed`/`operation`
 * (supabase/migrations/20260911041142_0022_project_events_actions.sql).
 */
interface UpdateProjectEventRpcRow extends ProjectEventRow {
  changed: boolean;
  operation: "UPDATED" | null;
}

function mapRpcError(error: { code: string; message: string }, fallbackMessage: string): never {
  const known = PROJECT_EVENTS_RPC_ERROR_CODES[error.code];
  if (known) {
    throw new ApiError(known.kind, known.message);
  }
  throw new Error(fallbackMessage);
}

export const supabaseProjectEventsGateway: ProjectEventsGateway<SupabaseClient> = {
  async projectExists(client, projectId: string): Promise<boolean> {
    const { data, error } = await client
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query project");
    }

    return data !== null;
  },

  async listProjectEvents(client, projectId: string): Promise<ProjectEventRecord[]> {
    const { data, error } = await client
      .from("project_events")
      .select(PROJECT_EVENT_COLUMNS)
      .eq("project_id", projectId)
      // Stable deterministic ordering (task §3): chronological by the
      // canonical starts_at instant, id as a tiebreaker for full
      // determinism when two events share the same starts_at (mirrors
      // project-repository.ts's own `.order(..).order("id", ..)` pattern).
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw new Error("Failed to query project events");
    }

    return (data as unknown as ProjectEventRow[]).map(toProjectEventRecord);
  },

  async createProjectEvent(
    client,
    projectId: string,
    input: ProjectEventInput,
  ): Promise<CreateProjectEventResult> {
    const { data, error } = await client.rpc("create_project_event", {
      p_project_id: projectId,
      ...toRpcInput(input),
    });

    if (error) {
      mapRpcError(error, "Failed to create project event");
    }

    const rows = data as unknown as CreateProjectEventRpcRow[] | null;
    const row = rows?.[0];

    if (!row) {
      throw new Error("Failed to create project event");
    }

    return { event: toProjectEventRecord(row) };
  },

  async updateProjectEvent(
    client,
    projectId: string,
    eventId: string,
    input: ProjectEventInput,
  ): Promise<UpdateProjectEventResult> {
    const { data, error } = await client.rpc("update_project_event", {
      p_project_id: projectId,
      p_event_id: eventId,
      ...toRpcInput(input),
    });

    if (error) {
      mapRpcError(error, "Failed to update project event");
    }

    const rows = data as unknown as UpdateProjectEventRpcRow[] | null;
    const row = rows?.[0];

    if (!row) {
      throw new Error("Failed to update project event");
    }

    return {
      event: toProjectEventRecord(row),
      changed: row.changed,
      operation: row.operation,
    };
  },

  async deleteProjectEvent(client, projectId: string, eventId: string): Promise<void> {
    const { error } = await client.rpc("delete_project_event", {
      p_project_id: projectId,
      p_event_id: eventId,
    });

    if (error) {
      mapRpcError(error, "Failed to delete project event");
    }
  },
};
