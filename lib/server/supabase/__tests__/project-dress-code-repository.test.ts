import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { supabaseProjectDressCodeGateway } from "../project-dress-code-repository";

const projectId = "11111111-1111-4111-8111-111111111111";
const stamp = "2026-10-01T00:00:00+00:00";
const s1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const s2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Result = { data: unknown; error?: { message: string } | null };

function dressCodeRow(description: string | null) {
  return { project_id: projectId, description, created_at: stamp, updated_at: stamp };
}

function swatchRow(id: string, color: string, sortOrder: number) {
  return { id, project_id: projectId, color, sort_order: sortOrder, created_at: stamp, updated_at: stamp };
}

function fakeClient(results: { dressCode: Result; swatches?: Result }) {
  const calls: unknown[][] = [];
  const builderFor = (table: string) => {
    const result = table === "project_dress_codes" ? results.dressCode : results.swatches;
    if (result === undefined) throw new Error(`unexpected query on ${table}`);
    const settle = () => ({ data: result.data, error: result.error ?? null });
    const builder = {
      select: (...args: unknown[]) => (calls.push([table, "select", ...args]), builder),
      eq: (...args: unknown[]) => (calls.push([table, "eq", ...args]), builder),
      order: (...args: unknown[]) => (calls.push([table, "order", ...args]), builder),
      maybeSingle: async () => settle(),
      then: (resolve: (value: unknown) => unknown) => resolve(settle()),
    };
    return builder;
  };
  return { client: { from: builderFor } as unknown as SupabaseClient, calls };
}

describe("supabaseProjectDressCodeGateway.getProjectDressCode", () => {
  it("returns null (and reads no swatches) when the Project has no Dress Code", async () => {
    const { client, calls } = fakeClient({ dressCode: { data: null } });
    expect(await supabaseProjectDressCodeGateway.getProjectDressCode(client, projectId)).toBeNull();
    expect(calls.some(([table]) => table === "project_dress_code_swatches")).toBe(false);
  });

  it("returns a description-only Dress Code with no swatches", async () => {
    const { client } = fakeClient({ dressCode: { data: dressCodeRow("Tông be, nâu") }, swatches: { data: [] } });
    expect(await supabaseProjectDressCodeGateway.getProjectDressCode(client, projectId)).toEqual({
      dressCode: { projectId, description: "Tông be, nâu", createdAt: stamp, updatedAt: stamp },
      swatches: [],
    });
  });

  it("returns swatches with a null description, colours copied exactly", async () => {
    const { client } = fakeClient({
      dressCode: { data: dressCodeRow(null) },
      swatches: { data: [swatchRow(s1, "#caa06a", 0)] },
    });
    const result = await supabaseProjectDressCodeGateway.getProjectDressCode(client, projectId);
    expect(result?.dressCode.description).toBeNull();
    expect(result?.swatches).toEqual([
      { id: s1, projectId, color: "#caa06a", sortOrder: 0, createdAt: stamp, updatedAt: stamp },
    ]);
  });

  it("returns description + multiple swatches in database order, scoped and ordered in the query", async () => {
    const { client, calls } = fakeClient({
      dressCode: { data: dressCodeRow("Pastel") },
      swatches: { data: [swatchRow(s2, "#7c5c42", 0), swatchRow(s1, "#e8dcc8", 1)] },
    });
    const result = await supabaseProjectDressCodeGateway.getProjectDressCode(client, projectId);
    expect(result?.swatches.map((swatch) => [swatch.id, swatch.color])).toEqual([
      [s2, "#7c5c42"],
      [s1, "#e8dcc8"],
    ]);
    expect(calls).toEqual([
      ["project_dress_codes", "select", "project_id, description, created_at, updated_at"],
      ["project_dress_codes", "eq", "project_id", projectId],
      ["project_dress_code_swatches", "select", "id, project_id, color, sort_order, created_at, updated_at"],
      ["project_dress_code_swatches", "eq", "project_id", projectId],
      ["project_dress_code_swatches", "order", "sort_order", { ascending: true }],
      ["project_dress_code_swatches", "order", "id", { ascending: true }],
    ]);
  });

  it.each(["#FFFFFF", "#fff", "red", "var(--x)", "url(test)", "#123456;"])(
    "fails loudly on a non-canonical swatch colour %s",
    async (color) => {
      const { client } = fakeClient({
        dressCode: { data: dressCodeRow(null) },
        swatches: { data: [swatchRow(s1, color, 0)] },
      });
      await expect(supabaseProjectDressCodeGateway.getProjectDressCode(client, projectId)).rejects.toThrow(
        "Unexpected result shape from the database",
      );
    },
  );

  it.each([
    ["dress code of another project", { dressCode: { data: { ...dressCodeRow(null), project_id: s1 } } }],
    ["non-string description", { dressCode: { data: { ...dressCodeRow(null), description: 5 } } }],
    [
      "swatch of another project",
      { dressCode: { data: dressCodeRow(null) }, swatches: { data: [{ ...swatchRow(s1, "#caa06a", 0), project_id: s2 }] } },
    ],
    ["non-array swatch payload", { dressCode: { data: dressCodeRow(null) }, swatches: { data: null } }],
  ])("rejects a malformed result: %s", async (_name, results) => {
    const { client } = fakeClient(results);
    await expect(supabaseProjectDressCodeGateway.getProjectDressCode(client, projectId)).rejects.toThrow(
      "Unexpected result shape from the database",
    );
  });

  it("surfaces a Dress Code query error instead of returning null", async () => {
    const { client } = fakeClient({ dressCode: { data: null, error: { message: "permission denied" } } });
    await expect(supabaseProjectDressCodeGateway.getProjectDressCode(client, projectId)).rejects.toThrow(
      "Failed to query project dress code",
    );
  });

  it("surfaces a swatch query error instead of returning no swatches", async () => {
    const { client } = fakeClient({
      dressCode: { data: dressCodeRow(null) },
      swatches: { data: null, error: { message: "boom" } },
    });
    await expect(supabaseProjectDressCodeGateway.getProjectDressCode(client, projectId)).rejects.toThrow(
      "Failed to query project dress code swatches",
    );
  });
});
