import type { SupabaseClient } from "@supabase/supabase-js";

import { PROJECT_STATUSES, type ProjectStatus } from "../../domain";
import type { DashboardGateway } from "../dashboard/dashboard-gateway";
import type { DashboardDeadlineProject, InstantRange } from "../dashboard/dashboard-types";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Production DashboardGateway (Task 034C): `count: "exact", head: true`
 * queries (no rows transferred) on `projects` / `project_tasks`, plus one
 * bounded deadline list. Staff-scoped client only — never `service_role`.
 * Read-only; never touches `activity_logs`.
 */

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

/** PostgREST `in` list; values are canonical status codes only. */
function inList(values: readonly string[]): string {
  return `(${values.join(",")})`;
}

interface FilterBuilder<T> {
  eq(column: string, value: string): T;
  in(column: string, values: readonly string[]): T;
  not(column: string, operator: string, value: string): T;
  gte(column: string, value: string): T;
  lt(column: string, value: string): T;
  lte(column: string, value: string): T;
}

function applyRange<T extends FilterBuilder<T>>(query: T, column: string, range: InstantRange | undefined): T {
  let q = query;
  if (range?.gte !== undefined) q = q.gte(column, range.gte);
  if (range?.lt !== undefined) q = q.lt(column, range.lt);
  if (range?.lte !== undefined) q = q.lte(column, range.lte);
  return q;
}

function toCount(result: { count: number | null; error: unknown }): number {
  if (result.error) {
    throw new Error("Failed to count dashboard rows");
  }
  if (typeof result.count !== "number" || !Number.isInteger(result.count) || result.count < 0) fail();
  return result.count;
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

function toDeadlineProject(value: unknown): DashboardDeadlineProject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const { id, project_code, status, deadline_at } = value as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    !isValidUuid(id) ||
    typeof project_code !== "string" ||
    !isProjectStatus(status) ||
    typeof deadline_at !== "string" ||
    !isValidTimestamptz(deadline_at)
  ) {
    fail();
  }
  return { id, projectCode: project_code, status, deadlineAt: deadline_at };
}

export const supabaseDashboardGateway: DashboardGateway<SupabaseClient> = {
  async countProjects(client, filter) {
    let query = client.from("projects").select("id", { count: "exact", head: true });
    if (filter.status !== undefined) query = query.eq("status", filter.status);
    if (filter.excludeStatuses?.length) query = query.not("status", "in", inList(filter.excludeStatuses));
    query = applyRange(query, "deadline_at", filter.deadlineAt);
    query = applyRange(query, "completed_at", filter.completedAt);
    return toCount(await query);
  },

  async countTasks(client, filter) {
    // !inner: only tasks whose parent Project passes the status filter are counted.
    let query = client
      .from("project_tasks")
      .select("id, projects!inner(status)", { count: "exact", head: true })
      .in("status", filter.statuses);
    if (filter.excludeProjectStatuses.length) {
      query = query.not("projects.status", "in", inList(filter.excludeProjectStatuses));
    }
    query = applyRange(query, "due_at", filter.dueAt);
    return toCount(await query);
  },

  async listDeadlineProjects(client, filter, limit) {
    let query = client.from("projects").select("id, project_code, status, deadline_at");
    if (filter.status !== undefined) query = query.eq("status", filter.status);
    if (filter.excludeStatuses?.length) query = query.not("status", "in", inList(filter.excludeStatuses));
    query = applyRange(query, "deadline_at", filter.deadlineAt);
    const { data, error } = await query
      .order("deadline_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    if (error) {
      throw new Error("Failed to list dashboard projects");
    }
    if (!Array.isArray(data)) fail();
    return (data as unknown[]).map(toDeadlineProject);
  },
};
