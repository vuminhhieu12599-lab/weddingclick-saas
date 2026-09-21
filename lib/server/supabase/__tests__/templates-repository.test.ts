import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { supabaseTemplatesGateway } from "../templates-repository";

function fakeClient(options: {
  templates?: { data?: unknown; error?: { message: string } | null };
  templateVersions?: { data?: unknown; error?: { message: string } | null };
}): SupabaseClient {
  return {
    from: (table: string) => {
      const result =
        table === "templates" ? options.templates ?? { data: [] } : options.templateVersions ?? { data: [] };

      return {
        select: () => ({
          order: () => ({
            order: async () => ({ data: result.data ?? null, error: result.error ?? null }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

const templateRow = {
  id: "33333333-3333-3333-3333-333333333333",
  code: "elegant-editorial",
  event_type: "WEDDING",
  name: "Elegant Editorial",
  description: null,
  is_active: true,
  sort_order: 1,
  preview_media_path: null,
};

const versionRow = {
  id: "22222222-2222-2222-2222-222222222222",
  template_id: templateRow.id,
  version_number: 1,
  renderer_key: "wedding.elegant-editorial.v1",
  manifest: { schemaVersion: 1 },
  retired_at: null,
};

describe("supabaseTemplatesGateway.listTemplatesWithVersions", () => {
  it("returns an empty array when there are no templates", async () => {
    const client = fakeClient({ templates: { data: [] }, templateVersions: { data: [] } });
    expect(await supabaseTemplatesGateway.listTemplatesWithVersions(client)).toEqual([]);
  });

  it("nests each version under its parent template by template_id", async () => {
    const client = fakeClient({
      templates: { data: [templateRow] },
      templateVersions: { data: [versionRow] },
    });

    const result = await supabaseTemplatesGateway.listTemplatesWithVersions(client);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(templateRow.id);
    expect(result[0].versions).toHaveLength(1);
    expect(result[0].versions[0].id).toBe(versionRow.id);
    expect(result[0].versions[0].manifest).toEqual({ schemaVersion: 1 });
  });

  it("returns a template with an empty versions array when it has no versions", async () => {
    const client = fakeClient({
      templates: { data: [templateRow] },
      templateVersions: { data: [] },
    });

    const result = await supabaseTemplatesGateway.listTemplatesWithVersions(client);
    expect(result[0].versions).toEqual([]);
  });

  it("maps every camelCase field correctly", async () => {
    const client = fakeClient({
      templates: { data: [templateRow] },
      templateVersions: { data: [versionRow] },
    });

    const result = await supabaseTemplatesGateway.listTemplatesWithVersions(client);

    expect(result[0]).toMatchObject({
      id: templateRow.id,
      code: "elegant-editorial",
      eventType: "WEDDING",
      name: "Elegant Editorial",
      description: null,
      isActive: true,
      sortOrder: 1,
      previewMediaPath: null,
    });
    expect(result[0].versions[0]).toMatchObject({
      id: versionRow.id,
      versionNumber: 1,
      rendererKey: "wedding.elegant-editorial.v1",
      retiredAt: null,
    });
  });

  it("throws a generic error when the templates query fails", async () => {
    const client = fakeClient({ templates: { error: { message: "raw postgres detail" } } });
    const error = await supabaseTemplatesGateway.listTemplatesWithVersions(client).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("throws a generic error when the template_versions query fails", async () => {
    const client = fakeClient({
      templates: { data: [templateRow] },
      templateVersions: { error: { message: "raw postgres detail" } },
    });
    const error = await supabaseTemplatesGateway.listTemplatesWithVersions(client).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("throws when a template row is malformed", async () => {
    const client = fakeClient({
      templates: { data: [{ ...templateRow, is_active: "yes" }] },
      templateVersions: { data: [] },
    });
    await expect(supabaseTemplatesGateway.listTemplatesWithVersions(client)).rejects.toThrow();
  });

  it("throws when a template_versions row is malformed", async () => {
    const client = fakeClient({
      templates: { data: [templateRow] },
      templateVersions: { data: [{ ...versionRow, version_number: "one" }] },
    });
    await expect(supabaseTemplatesGateway.listTemplatesWithVersions(client)).rejects.toThrow();
  });

  it("rejects a non-array templates query result (Finding 5C)", async () => {
    const client = fakeClient({
      templates: { data: { unexpected: "object" } },
      templateVersions: { data: [] },
    });
    await expect(supabaseTemplatesGateway.listTemplatesWithVersions(client)).rejects.toThrow();
  });

  it("rejects a non-array template_versions query result (Finding 5C)", async () => {
    const client = fakeClient({
      templates: { data: [templateRow] },
      templateVersions: { data: { unexpected: "object" } },
    });
    await expect(supabaseTemplatesGateway.listTemplatesWithVersions(client)).rejects.toThrow();
  });

  it("rejects a fractional sort_order (Finding 5B)", async () => {
    const client = fakeClient({
      templates: { data: [{ ...templateRow, sort_order: 1.5 }] },
      templateVersions: { data: [] },
    });
    await expect(supabaseTemplatesGateway.listTemplatesWithVersions(client)).rejects.toThrow();
  });

  it("rejects a fractional version_number (Finding 5B)", async () => {
    const client = fakeClient({
      templates: { data: [templateRow] },
      templateVersions: { data: [{ ...versionRow, version_number: 1.5 }] },
    });
    await expect(supabaseTemplatesGateway.listTemplatesWithVersions(client)).rejects.toThrow();
  });

  it("rejects a non-positive version_number", async () => {
    const client = fakeClient({
      templates: { data: [templateRow] },
      templateVersions: { data: [{ ...versionRow, version_number: 0 }] },
    });
    await expect(supabaseTemplatesGateway.listTemplatesWithVersions(client)).rejects.toThrow();
  });

  it("rejects an orphan template-version row whose template_id matches no returned template (Finding 5D)", async () => {
    const client = fakeClient({
      templates: { data: [templateRow] },
      templateVersions: {
        data: [{ ...versionRow, template_id: "99999999-9999-9999-9999-999999999999" }],
      },
    });
    await expect(supabaseTemplatesGateway.listTemplatesWithVersions(client)).rejects.toThrow();
  });
});
