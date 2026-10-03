import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProjectTimelineGateway } from "../project-timeline/project-timeline-gateway";
import type { ProjectTimelineItemRecord } from "../project-timeline/project-timeline-types";
import type {
  ProjectTimelineItemPatch,
  ProjectTimelineWriteGateway,
} from "../project-timeline/project-timeline-write-gateway";
import { toCanonicalTimelineTime } from "../project-timeline/timeline-time-of-day";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Production ProjectTimelineGateway: direct RLS SELECT on
 * `project_timeline_items` (migration 0029) with a staff-scoped client only.
 * Every row is validated; the TIME(0) value is converted to canonical
 * `HH:mm` here (and only here).
 */
const PROJECT_TIMELINE_ITEM_COLUMNS = "id, project_id, time_of_day, label, sort_order, created_at, updated_at";

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isRecordShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTimelineItemRecord(value: unknown, projectId: string): ProjectTimelineItemRecord {
  if (!isRecordShape(value)) fail();
  const { id, project_id, time_of_day, label, sort_order, created_at, updated_at } = value;

  if (
    typeof id !== "string" ||
    !isValidUuid(id) ||
    project_id !== projectId ||
    typeof label !== "string" ||
    typeof sort_order !== "number" ||
    !Number.isInteger(sort_order) ||
    typeof created_at !== "string" ||
    !isValidTimestamptz(created_at) ||
    typeof updated_at !== "string" ||
    !isValidTimestamptz(updated_at)
  ) {
    fail();
  }

  return {
    id,
    projectId,
    time: toCanonicalTimelineTime(time_of_day),
    label,
    sortOrder: sort_order,
    createdAt: created_at,
    updatedAt: updated_at,
  };
}

export const supabaseProjectTimelineGateway: ProjectTimelineGateway<SupabaseClient> = {
  async listProjectTimelineItems(client, projectId) {
    const { data, error } = await client
      .from("project_timeline_items")
      .select(PROJECT_TIMELINE_ITEM_COLUMNS)
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw new Error("Failed to query project timeline items");
    }
    if (!Array.isArray(data)) fail();

    return data.map((row: unknown) => toTimelineItemRecord(row, projectId));
  },
};

/** Write payload columns: `time` is written as `HH:mm` (TIME(0), seconds zero). */
function toTimelineRowPatch(patch: ProjectTimelineItemPatch): Record<string, string | number> {
  const row: Record<string, string | number> = {};
  if (patch.time !== undefined) row.time_of_day = patch.time;
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  return row;
}

/**
 * Production ProjectTimelineWriteGateway: one plain RLS statement per write
 * (staff-scoped client only), each scoped by `project_id`; returned rows go
 * through the same validation/`HH:mm` conversion as reads.
 */
export const supabaseProjectTimelineWriteGateway: ProjectTimelineWriteGateway<SupabaseClient> = {
  async projectExists(client, projectId) {
    const { data, error } = await client.from("projects").select("id").eq("id", projectId).maybeSingle();
    if (error) {
      throw new Error("Failed to query project");
    }
    return data !== null;
  },

  async insertTimelineItem(client, projectId, input) {
    const { data, error } = await client
      .from("project_timeline_items")
      .insert({ project_id: projectId, ...toTimelineRowPatch(input) })
      .select(PROJECT_TIMELINE_ITEM_COLUMNS)
      .single();
    if (error) {
      throw new Error("Failed to insert project timeline item");
    }
    return toTimelineItemRecord(data, projectId);
  },

  async updateTimelineItem(client, projectId, itemId, patch) {
    const { data, error } = await client
      .from("project_timeline_items")
      .update(toTimelineRowPatch(patch))
      .eq("project_id", projectId)
      .eq("id", itemId)
      .select(PROJECT_TIMELINE_ITEM_COLUMNS)
      .maybeSingle();
    if (error) {
      throw new Error("Failed to update project timeline item");
    }
    return data === null ? null : toTimelineItemRecord(data, projectId);
  },

  async deleteTimelineItem(client, projectId, itemId) {
    const { data, error } = await client
      .from("project_timeline_items")
      .delete()
      .eq("project_id", projectId)
      .eq("id", itemId)
      .select("id");
    if (error) {
      throw new Error("Failed to delete project timeline item");
    }
    if (!Array.isArray(data)) fail();
    return data.length > 0;
  },
};
