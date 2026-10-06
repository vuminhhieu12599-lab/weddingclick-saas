import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { supabaseDashboardGateway } from "../dashboard-repository";

/** Records every builder call; resolves each `from()` with the next queued result. */
function fakeClient(results: { data?: unknown; count?: number | null; error?: unknown }[]) {
  const calls: unknown[][] = [];
  function builder() {
    const b: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "not", "gte", "lt", "lte", "order", "limit"]) {
      b[method] = (...args: unknown[]) => (calls.push([method, ...args]), b);
    }
    b.then = (resolve: (value: unknown) => unknown) => {
      const next = results.shift()!;
      return resolve({ data: next.data ?? null, count: next.count ?? null, error: next.error ?? null });
    };
    return b;
  }
  const client = { from: (table: string) => (calls.push(["from", table]), builder()) } as unknown as SupabaseClient;
  return { client, calls };
}

const NOW = "2026-10-06T05:00:00.000Z";
const END = "2026-10-13T05:00:00.000Z";

describe("supabaseDashboardGateway", () => {
  it("countProjects: head-only exact count with status, exclusion and instant bounds", async () => {
    const { client, calls } = fakeClient([{ count: 4 }]);
    const n = await supabaseDashboardGateway.countProjects(client, {
      excludeStatuses: ["PUBLISHED", "COMPLETED", "ARCHIVED"],
      deadlineAt: { gte: NOW, lte: END },
    });
    expect(n).toBe(4);
    expect(calls).toEqual([
      ["from", "projects"],
      ["select", "id", { count: "exact", head: true }],
      ["not", "status", "in", "(PUBLISHED,COMPLETED,ARCHIVED)"],
      ["gte", "deadline_at", NOW],
      ["lte", "deadline_at", END],
    ]);
    const completed = fakeClient([{ count: 1 }]);
    await supabaseDashboardGateway.countProjects(completed.client, { status: "COMPLETED", completedAt: { gte: NOW } });
    expect(completed.calls).toContainEqual(["eq", "status", "COMPLETED"]);
    expect(completed.calls).toContainEqual(["gte", "completed_at", NOW]);
  });

  it("countTasks: inner-joins the parent Project and excludes closed Project statuses", async () => {
    const { client, calls } = fakeClient([{ count: 2 }]);
    const n = await supabaseDashboardGateway.countTasks(client, {
      statuses: ["TODO", "IN_PROGRESS"],
      excludeProjectStatuses: ["COMPLETED", "ARCHIVED"],
      dueAt: { lt: NOW },
    });
    expect(n).toBe(2);
    expect(calls).toEqual([
      ["from", "project_tasks"],
      ["select", "id, projects!inner(status)", { count: "exact", head: true }],
      ["in", "status", ["TODO", "IN_PROGRESS"]],
      ["not", "projects.status", "in", "(COMPLETED,ARCHIVED)"],
      ["lt", "due_at", NOW],
    ]);
  });

  it("listDeadlineProjects: navigation columns only, deadline/id ascending, bounded, validated", async () => {
    const row = { id: "11111111-1111-4111-8111-111111111111", project_code: "WC-2026-000001", status: "NEW", deadline_at: "2026-10-05T00:00:00+00:00" };
    const { client, calls } = fakeClient([{ data: [row] }]);
    const rows = await supabaseDashboardGateway.listDeadlineProjects(client, { deadlineAt: { lt: NOW } }, 10);
    expect(rows).toEqual([{ id: row.id, projectCode: row.project_code, status: "NEW", deadlineAt: row.deadline_at }]);
    expect(calls).toContainEqual(["select", "id, project_code, status, deadline_at"]);
    expect(calls.filter((c) => c[0] === "order")).toEqual([
      ["order", "deadline_at", { ascending: true }],
      ["order", "id", { ascending: true }],
    ]);
    expect(calls).toContainEqual(["limit", 10]);
    const bad = fakeClient([{ data: [{ ...row, status: "SOMETHING" }] }]);
    await expect(supabaseDashboardGateway.listDeadlineProjects(bad.client, { deadlineAt: { lt: NOW } }, 10)).rejects.toThrow();
  });

  it("fails closed on a DB error or a missing count", async () => {
    await expect(supabaseDashboardGateway.countProjects(fakeClient([{ error: { message: "x" } }]).client, {})).rejects.toThrow();
    await expect(supabaseDashboardGateway.countProjects(fakeClient([{ count: null }]).client, {})).rejects.toThrow();
  });
});
