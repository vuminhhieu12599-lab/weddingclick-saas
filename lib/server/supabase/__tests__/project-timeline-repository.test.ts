import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { TimelineTimeOfDayError, toCanonicalTimelineTime } from "../../project-timeline/timeline-time-of-day";
import { supabaseProjectTimelineGateway } from "../project-timeline-repository";

const projectId = "11111111-1111-4111-8111-111111111111";
const stamp = "2026-10-01T00:00:00+00:00";

function row(id: string, timeOfDay: unknown, sortOrder: number, label = "Đón khách") {
  return { id, project_id: projectId, time_of_day: timeOfDay, label, sort_order: sortOrder, created_at: stamp, updated_at: stamp };
}

function fakeClient(result: { data: unknown; error?: { message: string } | null }) {
  const calls: unknown[][] = [];
  const builder = {
    select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
    order: (...args: unknown[]) => (calls.push(["order", ...args]), builder),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: result.data, error: result.error ?? null }),
  };
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("toCanonicalTimelineTime", () => {
  it.each([
    ["08:30:00", "08:30"],
    ["23:59:00", "23:59"],
    ["00:00:00", "00:00"],
  ])("converts %s to %s", (input, expected) => {
    expect(toCanonicalTimelineTime(input)).toBe(expected);
  });

  it.each(["08:30:15", "08:30", "08:30:00.5", "08:30:00+07", "24:00:00", "8:30:00", " 08:30:00", "", null, 830])(
    "rejects %s",
    (input) => {
      expect(() => toCanonicalTimelineTime(input)).toThrow(TimelineTimeOfDayError);
    },
  );
});

describe("supabaseProjectTimelineGateway.listProjectTimelineItems", () => {
  it("returns [] for a Project without Timeline rows", async () => {
    const { client } = fakeClient({ data: [] });
    expect(await supabaseProjectTimelineGateway.listProjectTimelineItems(client, projectId)).toEqual([]);
  });

  it("scopes by project and orders by sort_order then id in the query", async () => {
    const { client, calls } = fakeClient({ data: [] });
    await supabaseProjectTimelineGateway.listProjectTimelineItems(client, projectId);
    expect(calls).toEqual([
      ["from", "project_timeline_items"],
      ["select", "id, project_id, time_of_day, label, sort_order, created_at, updated_at"],
      ["eq", "project_id", projectId],
      ["order", "sort_order", { ascending: true }],
      ["order", "id", { ascending: true }],
    ]);
  });

  it("maps one row with canonical HH:mm time", async () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { client } = fakeClient({ data: [row(id, "08:30:00", 0)] });
    expect(await supabaseProjectTimelineGateway.listProjectTimelineItems(client, projectId)).toEqual([
      { id, projectId, time: "08:30", label: "Đón khách", sortOrder: 0, createdAt: stamp, updatedAt: stamp },
    ]);
  });

  it("keeps the database order for multiple rows (never re-sorted by time)", async () => {
    const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const { client } = fakeClient({
      data: [row(a, "23:59:00", 0, "Tiễn khách"), row(b, "08:30:00", 1), row(c, "10:00:00", 1, "Lễ")],
    });
    const items = await supabaseProjectTimelineGateway.listProjectTimelineItems(client, projectId);
    expect(items.map((item) => [item.id, item.time])).toEqual([
      [a, "23:59"],
      [b, "08:30"],
      [c, "10:00"],
    ]);
  });

  it("fails loudly on non-zero seconds instead of truncating", async () => {
    const { client } = fakeClient({ data: [row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "08:30:15", 0)] });
    await expect(supabaseProjectTimelineGateway.listProjectTimelineItems(client, projectId)).rejects.toThrow(
      TimelineTimeOfDayError,
    );
  });

  it.each([
    ["another project's row", { ...row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "08:30:00", 0), project_id: "22222222-2222-4222-8222-222222222222" }],
    ["a non-integer sort order", row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "08:30:00", 1.5)],
    ["a non-string label", { ...row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "08:30:00", 0), label: null }],
    ["a non-object row", "row"],
  ])("rejects a malformed row: %s", async (_name, bad) => {
    const { client } = fakeClient({ data: [bad] });
    await expect(supabaseProjectTimelineGateway.listProjectTimelineItems(client, projectId)).rejects.toThrow(
      "Unexpected result shape from the database",
    );
  });

  it("surfaces a query error instead of returning []", async () => {
    const { client } = fakeClient({ data: null, error: { message: "permission denied" } });
    await expect(supabaseProjectTimelineGateway.listProjectTimelineItems(client, projectId)).rejects.toThrow(
      "Failed to query project timeline items",
    );
  });

  it("rejects a non-array success payload", async () => {
    const { client } = fakeClient({ data: null });
    await expect(supabaseProjectTimelineGateway.listProjectTimelineItems(client, projectId)).rejects.toThrow(
      "Unexpected result shape from the database",
    );
  });
});
