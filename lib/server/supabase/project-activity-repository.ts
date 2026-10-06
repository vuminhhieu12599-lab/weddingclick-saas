import type { SupabaseClient } from "@supabase/supabase-js";

import { ACTIVITY_ACTION_TYPES, ACTIVITY_ACTOR_TYPES, type ActivityActionType, type ActivityActorType } from "../../domain";
import type { ProjectActivityGateway } from "../project-activity/project-activity-gateway";
import type { ProjectActivityRow } from "../project-activity/project-activity-types";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Production ProjectActivityGateway (Task 034B): one Project-scoped
 * `activity_logs` SELECT (never `metadata`) plus at most one bounded
 * `profiles` read (`id, display_name`) for the distinct STAFF actors on the
 * page — no N+1. Staff-scoped client only, never `service_role`. Read-only.
 */
const ACTIVITY_COLUMNS = "id, project_id, actor_type, actor_profile_id, action_type, summary, created_at";

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isRecordShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActionType(value: unknown): value is ActivityActionType {
  return typeof value === "string" && (ACTIVITY_ACTION_TYPES as readonly string[]).includes(value);
}

function isActorType(value: unknown): value is ActivityActorType {
  return typeof value === "string" && (ACTIVITY_ACTOR_TYPES as readonly string[]).includes(value);
}

interface RawActivity {
  id: string;
  actorType: ActivityActorType;
  actorProfileId: string | null;
  actionType: ActivityActionType;
  summary: string;
  createdAt: string;
}

/** An action type outside the frozen union is an integrity fault (fail closed), never relabelled. */
function toRawActivity(value: unknown, projectId: string): RawActivity {
  if (!isRecordShape(value)) fail();
  const { id, project_id, actor_type, actor_profile_id, action_type, summary, created_at } = value;
  if (
    typeof id !== "string" ||
    !isValidUuid(id) ||
    project_id !== projectId ||
    !isActorType(actor_type) ||
    !(actor_profile_id === null || (typeof actor_profile_id === "string" && isValidUuid(actor_profile_id))) ||
    !isActionType(action_type) ||
    typeof summary !== "string" ||
    typeof created_at !== "string" ||
    !isValidTimestamptz(created_at)
  ) {
    fail();
  }
  return { id, actorType: actor_type, actorProfileId: actor_profile_id, actionType: action_type, summary, createdAt: created_at };
}

async function fetchStaffNames(client: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client.from("profiles").select("id, display_name").in("id", ids);
  if (error) {
    throw new Error("Failed to load staff names");
  }
  if (!Array.isArray(data)) fail();
  const names = new Map<string, string>();
  for (const row of data as unknown[]) {
    if (!isRecordShape(row) || typeof row.id !== "string" || typeof row.display_name !== "string") fail();
    names.set(row.id, row.display_name);
  }
  return names;
}

export const supabaseProjectActivityGateway: ProjectActivityGateway<SupabaseClient> = {
  async projectExists(client, projectId) {
    const { data, error } = await client.from("projects").select("id").eq("id", projectId).maybeSingle();
    if (error) {
      throw new Error("Failed to query project");
    }
    return data !== null;
  },

  async listProjectActivity(client, projectId, { before, limit }) {
    let query = client.from("activity_logs").select(ACTIVITY_COLUMNS).eq("project_id", projectId);
    if (before !== null) {
      // Values are validated (TIMESTAMPTZ / UUID) by the cursor decoder and quoted for PostgREST.
      query = query.or(`created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`);
    }
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    if (error) {
      throw new Error("Failed to query project activity");
    }
    if (!Array.isArray(data)) fail();
    const rows = (data as unknown[]).map((row) => toRawActivity(row, projectId));

    const staffIds = [
      ...new Set(rows.flatMap((row) => (row.actorType === "STAFF" && row.actorProfileId !== null ? [row.actorProfileId] : []))),
    ];
    const names = await fetchStaffNames(client, staffIds);
    return rows.map(
      (row): ProjectActivityRow => ({
        id: row.id,
        actionType: row.actionType,
        summary: row.summary,
        actorType: row.actorType,
        staffDisplayName: row.actorProfileId === null ? null : (names.get(row.actorProfileId) ?? null),
        createdAt: row.createdAt,
      }),
    );
  },
};
