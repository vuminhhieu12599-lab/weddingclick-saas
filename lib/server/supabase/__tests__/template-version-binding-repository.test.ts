import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { supabaseTemplateVersionBindingGateway } from "../template-version-binding-repository";

const versionId = "f0000000-0000-4000-8000-000000000001";

function client(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const builder = {
    select: (columns: string) => (calls.push(["select", columns]), builder),
    eq: (column: string, value: string) => (calls.push(["eq", column, value]), builder),
    maybeSingle: async () => result,
  };
  const fake = { from: (table: string) => (calls.push(["from", table]), builder) } as unknown as SupabaseClient;
  return { fake, calls };
}

const get = (fake: SupabaseClient) => supabaseTemplateVersionBindingGateway.getTemplateVersionBinding(fake, versionId);

describe("supabaseTemplateVersionBindingGateway", () => {
  it("reads the exact version row's renderer key unchanged", async () => {
    const { fake, calls } = client({ data: { id: versionId, renderer_key: "row.key.v7" }, error: null });
    expect(await get(fake)).toEqual({ id: versionId, rendererKey: "row.key.v7" });
    expect(calls).toEqual([["from", "template_versions"], ["select", "id, renderer_key"], ["eq", "id", versionId]]);
  });

  it("returns null only for a real no-row result", async () => {
    expect(await get(client({ data: null, error: null }).fake)).toBeNull();
  });

  it("throws on a query error", async () => {
    await expect(get(client({ data: null, error: { message: "boom" } }).fake)).rejects.toThrow("Failed to query template version");
  });

  it.each([
    { id: "f0000000-0000-4000-8000-000000000002", renderer_key: "row.key.v7" },
    { id: versionId, renderer_key: "" },
    { id: versionId, renderer_key: null },
    [],
  ])("fails closed on a malformed or mis-bound row %#", async (data) => {
    await expect(get(client({ data, error: null }).fake)).rejects.toThrow("Unexpected result shape");
  });
});
