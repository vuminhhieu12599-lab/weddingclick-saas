import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { ACTIVITY_ACTION_TYPES } from "../../../domain";
import { supabaseProjectActivityGateway } from "../project-activity-repository";

const projectId = "11111111-1111-4111-8111-111111111111";
const staffA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const staffB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function row(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    project_id: projectId,
    actor_type: "SYSTEM",
    actor_profile_id: null,
    action_type: "PROJECT_STATUS_CHANGED",
    summary: `Sự kiện ${n}`,
    created_at: "2026-10-01T00:00:00.123456+00:00",
    ...overrides,
  };
}

/** Per-table queued results; records every builder call. */
function fakeClient(results: Record<string, { data: unknown; error?: unknown }[]>) {
  const calls: unknown[][] = [];
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "or", "order", "limit", "maybeSingle"]) {
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

const list = (client: SupabaseClient, before: { createdAt: string; id: string } | null = null) =>
  supabaseProjectActivityGateway.listProjectActivity(client, projectId, { before, limit: 31 });

describe("supabaseProjectActivityGateway", () => {
  it("one scoped activity query (no metadata), newest first with id tie-break, bounded", async () => {
    const { client, calls } = fakeClient({ activity_logs: [{ data: [row(1)] }] });
    await list(client);
    const select = calls.find((c) => c[0] === "select");
    expect(select?.[1]).not.toMatch(/metadata/);
    expect(calls).toContainEqual(["eq", "project_id", projectId]);
    expect(calls.filter((c) => c[0] === "order")).toEqual([
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: false }],
    ]);
    expect(calls).toContainEqual(["limit", 31]);
    expect(calls.filter((c) => c[0] === "from")).toEqual([["from", "activity_logs"]]);
  });

  it("resolves distinct STAFF names in one bounded profiles read (no N+1); a missing profile reads null", async () => {
    const rows = [
      row(4, { actor_type: "STAFF", actor_profile_id: staffA }),
      row(3, { actor_type: "STAFF", actor_profile_id: staffA }),
      row(2, { actor_type: "STAFF", actor_profile_id: staffB }),
      row(1, { actor_type: "STAFF", actor_profile_id: null }),
    ];
    const { client, calls } = fakeClient({
      activity_logs: [{ data: rows }],
      profiles: [{ data: [{ id: staffA, display_name: "Lan" }] }],
    });
    const result = await list(client);
    expect(calls.filter((c) => c[0] === "from")).toEqual([["from", "activity_logs"], ["from", "profiles"]]);
    expect(calls).toContainEqual(["select", "id, display_name"]);
    expect(calls).toContainEqual(["in", "id", [staffA, staffB]]);
    expect(result.map((r) => r.staffDisplayName)).toEqual(["Lan", "Lan", null, null]);
    expect(JSON.stringify(result)).not.toContain(staffA);
  });

  it("applies the keyset cursor while keeping the Project filter", async () => {
    const { client, calls } = fakeClient({ activity_logs: [{ data: [] }] });
    const before = { createdAt: "2026-10-01T00:00:00.123456+00:00", id: "00000000-0000-4000-8000-000000000009" };
    await list(client, before);
    expect(calls).toContainEqual(["eq", "project_id", projectId]);
    expect(calls).toContainEqual([
      "or",
      `created_at.lt."${before.createdAt}",and(created_at.eq."${before.createdAt}",id.lt.${before.id})`,
    ]);
  });

  it("accepts every frozen action type", async () => {
    const rows = ACTIVITY_ACTION_TYPES.map((action_type, i) => row(i + 1, { action_type }));
    const { client } = fakeClient({ activity_logs: [{ data: rows }] });
    expect((await list(client)).map((r) => r.actionType)).toEqual([...ACTIVITY_ACTION_TYPES]);
  });

  it("fails closed on an unknown action type, unknown actor type or foreign Project row", async () => {
    for (const bad of [{ action_type: "TASK_CREATED" }, { actor_type: "ROBOT" }, { project_id: "22222222-2222-4222-8222-222222222222" }]) {
      const { client } = fakeClient({ activity_logs: [{ data: [row(1, bad)] }] });
      await expect(list(client)).rejects.toThrow();
    }
  });
});
