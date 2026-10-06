import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { supabaseProjectTasksGateway } from "../project-tasks-repository";

const projectId = "11111111-1111-4111-8111-111111111111";
const taskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const staffId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const stamp = "2026-10-01T00:00:00+00:00";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: taskId,
    project_id: projectId,
    title: "Gửi bản review",
    status: "TODO",
    due_at: null,
    assigned_staff_id: null,
    sort_order: 0,
    created_at: stamp,
    updated_at: stamp,
    ...overrides,
  };
}

/** Per-table queued results; records every builder call. */
function fakeClient(results: Record<string, { data: unknown; error?: unknown }[]>) {
  const calls: unknown[][] = [];
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "insert", "update", "delete", "single", "maybeSingle"]) {
      b[method] = (...args: unknown[]) => (calls.push([method, ...args]), b);
    }
    b.then = (resolve: (value: unknown) => unknown) => {
      const next = results[table].shift()!;
      return resolve({ data: next.data, error: next.error ?? null });
    };
    return b;
  }
  const client = { from: (table: string) => (calls.push(["from", table]), builder(table)) } as unknown as SupabaseClient;
  return { client, calls };
}

describe("supabaseProjectTasksGateway", () => {
  it("lists scoped by project with the deterministic order and no profile query when unassigned", async () => {
    const { client, calls } = fakeClient({ project_tasks: [{ data: [row()] }] });
    const tasks = await supabaseProjectTasksGateway.listProjectTasks(client, projectId);
    expect(tasks).toEqual([
      {
        id: taskId,
        projectId,
        title: "Gửi bản review",
        status: "TODO",
        dueAt: null,
        assignedStaffId: null,
        assignedStaffDisplayName: null,
        sortOrder: 0,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ]);
    expect(calls).toEqual([
      ["from", "project_tasks"],
      ["select", "id, project_id, title, status, due_at, assigned_staff_id, sort_order, created_at, updated_at"],
      ["eq", "project_id", projectId],
      ["order", "sort_order", { ascending: true }],
      ["order", "due_at", { ascending: true, nullsFirst: false }],
      ["order", "created_at", { ascending: true }],
      ["order", "id", { ascending: true }],
    ]);
  });

  it("resolves the assignee display name from profiles (id, display_name only)", async () => {
    const { client, calls } = fakeClient({
      project_tasks: [{ data: [row({ assigned_staff_id: staffId, due_at: "2026-10-10T02:00:00+00:00" })] }],
      profiles: [{ data: [{ id: staffId, display_name: "Lan" }] }],
    });
    const [task] = await supabaseProjectTasksGateway.listProjectTasks(client, projectId);
    expect(task).toMatchObject({ assignedStaffId: staffId, assignedStaffDisplayName: "Lan", dueAt: "2026-10-10T02:00:00+00:00" });
    expect(calls).toContainEqual(["select", "id, display_name"]);
    expect(calls).toContainEqual(["in", "id", [staffId]]);
  });

  it("updates only the patched columns, scoped by project_id and id, touching no other table", async () => {
    const { client, calls } = fakeClient({ project_tasks: [{ data: row({ status: "DONE" }) }] });
    const task = await supabaseProjectTasksGateway.updateProjectTask(client, projectId, taskId, { status: "DONE" });
    expect(task?.status).toBe("DONE");
    expect(calls.filter((c) => c[0] === "from")).toEqual([["from", "project_tasks"]]);
    expect(calls).toContainEqual(["update", { status: "DONE" }]);
    expect(calls).toContainEqual(["eq", "project_id", projectId]);
    expect(calls).toContainEqual(["eq", "id", taskId]);
  });

  it("delete is scoped and reports a foreign/unknown row as false", async () => {
    const { client, calls } = fakeClient({ project_tasks: [{ data: [] }] });
    expect(await supabaseProjectTasksGateway.deleteProjectTask(client, projectId, taskId)).toBe(false);
    expect(calls).toContainEqual(["eq", "project_id", projectId]);
    expect(calls).toContainEqual(["eq", "id", taskId]);
  });

  it("throws on a row with an unknown status instead of returning it", async () => {
    const { client } = fakeClient({ project_tasks: [{ data: [row({ status: "OVERDUE" })] }] });
    await expect(supabaseProjectTasksGateway.listProjectTasks(client, projectId)).rejects.toThrow();
  });

  it("assignable staff: active profiles only, id + display_name only", async () => {
    const { client, calls } = fakeClient({ profiles: [{ data: [{ id: staffId, display_name: "Lan" }] }] });
    expect(await supabaseProjectTasksGateway.listAssignableStaff(client)).toEqual([{ id: staffId, displayName: "Lan" }]);
    expect(calls).toContainEqual(["select", "id, display_name"]);
    expect(calls).toContainEqual(["eq", "is_active", true]);
  });
});
