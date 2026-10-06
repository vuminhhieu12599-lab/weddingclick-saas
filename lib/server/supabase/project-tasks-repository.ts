import type { SupabaseClient } from "@supabase/supabase-js";

import { PROJECT_TASK_STATUSES, type ProjectTaskStatus } from "../../domain";
import type {
  AssignableStaffRecord,
  ProjectTaskInput,
  ProjectTaskPatch,
  ProjectTaskRecord,
} from "../project-tasks/project-task-types";
import type { ProjectTasksGateway } from "../project-tasks/project-tasks-gateway";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Production ProjectTasksGateway (Task 034A): direct RLS statements on
 * `project_tasks` (migration 0019) and a minimal `profiles` read
 * (`id, display_name` only), always with a staff-scoped client — never
 * `service_role`. Every row is validated before it leaves this module.
 */
const PROJECT_TASK_COLUMNS =
  "id, project_id, title, status, due_at, assigned_staff_id, sort_order, created_at, updated_at";

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isRecordShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTaskStatus(value: unknown): value is ProjectTaskStatus {
  return typeof value === "string" && (PROJECT_TASK_STATUSES as readonly string[]).includes(value);
}

type TaskRow = Omit<ProjectTaskRecord, "assignedStaffDisplayName">;

function toTaskRow(value: unknown, projectId: string): TaskRow {
  if (!isRecordShape(value)) fail();
  const { id, project_id, title, status, due_at, assigned_staff_id, sort_order, created_at, updated_at } = value;

  if (
    typeof id !== "string" ||
    !isValidUuid(id) ||
    project_id !== projectId ||
    typeof title !== "string" ||
    !isTaskStatus(status) ||
    !(due_at === null || (typeof due_at === "string" && isValidTimestamptz(due_at))) ||
    !(assigned_staff_id === null || (typeof assigned_staff_id === "string" && isValidUuid(assigned_staff_id))) ||
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
    title,
    status,
    dueAt: due_at,
    assignedStaffId: assigned_staff_id,
    sortOrder: sort_order,
    createdAt: created_at,
    updatedAt: updated_at,
  };
}

/** Assignee display names regardless of `is_active` (a later deactivation never rewrites the task). */
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

async function withStaffNames(client: SupabaseClient, rows: TaskRow[]): Promise<ProjectTaskRecord[]> {
  const ids = [...new Set(rows.flatMap((row) => (row.assignedStaffId === null ? [] : [row.assignedStaffId])))];
  const names = await fetchStaffNames(client, ids);
  return rows.map((row) => ({
    ...row,
    assignedStaffDisplayName: row.assignedStaffId === null ? null : (names.get(row.assignedStaffId) ?? null),
  }));
}

function toTaskRowPatch(patch: ProjectTaskPatch | ProjectTaskInput): Record<string, string | number | null> {
  const row: Record<string, string | number | null> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if ("status" in patch && patch.status !== undefined) row.status = patch.status;
  if (patch.dueAt !== undefined) row.due_at = patch.dueAt;
  if (patch.assignedStaffId !== undefined) row.assigned_staff_id = patch.assignedStaffId;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  return row;
}

export const supabaseProjectTasksGateway: ProjectTasksGateway<SupabaseClient> = {
  async projectExists(client, projectId) {
    const { data, error } = await client.from("projects").select("id").eq("id", projectId).maybeSingle();
    if (error) {
      throw new Error("Failed to query project");
    }
    return data !== null;
  },

  async listProjectTasks(client, projectId) {
    const { data, error } = await client
      .from("project_tasks")
      .select(PROJECT_TASK_COLUMNS)
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      throw new Error("Failed to query project tasks");
    }
    if (!Array.isArray(data)) fail();
    return withStaffNames(client, data.map((row: unknown) => toTaskRow(row, projectId)));
  },

  async insertProjectTask(client, projectId, input) {
    const { data, error } = await client
      .from("project_tasks")
      .insert({ project_id: projectId, ...toTaskRowPatch(input) })
      .select(PROJECT_TASK_COLUMNS)
      .single();
    if (error) {
      throw new Error("Failed to insert project task");
    }
    const [record] = await withStaffNames(client, [toTaskRow(data, projectId)]);
    return record;
  },

  async updateProjectTask(client, projectId, taskId, patch) {
    const { data, error } = await client
      .from("project_tasks")
      .update(toTaskRowPatch(patch))
      .eq("project_id", projectId)
      .eq("id", taskId)
      .select(PROJECT_TASK_COLUMNS)
      .maybeSingle();
    if (error) {
      throw new Error("Failed to update project task");
    }
    if (data === null) return null;
    const [record] = await withStaffNames(client, [toTaskRow(data, projectId)]);
    return record;
  },

  async deleteProjectTask(client, projectId, taskId) {
    const { data, error } = await client
      .from("project_tasks")
      .delete()
      .eq("project_id", projectId)
      .eq("id", taskId)
      .select("id");
    if (error) {
      throw new Error("Failed to delete project task");
    }
    if (!Array.isArray(data)) fail();
    return data.length > 0;
  },

  async isActiveStaffProfile(client, profileId) {
    const { data, error } = await client
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) {
      throw new Error("Failed to query staff profile");
    }
    return data !== null;
  },

  async listAssignableStaff(client): Promise<AssignableStaffRecord[]> {
    const { data, error } = await client
      .from("profiles")
      .select("id, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      throw new Error("Failed to query staff profiles");
    }
    if (!Array.isArray(data)) fail();
    return (data as unknown[]).map((row) => {
      if (!isRecordShape(row) || typeof row.id !== "string" || !isValidUuid(row.id) || typeof row.display_name !== "string") fail();
      return { id: row.id, displayName: row.display_name };
    });
  },
};
