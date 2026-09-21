import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { SaveProjectDesignInput } from "../../project-design/project-design-types";
import { supabaseProjectDesignGateway } from "../project-design-repository";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

/**
 * `data?: unknown` alone can't distinguish "caller didn't pass `data` at
 * all" (tests that only care about the error path — should behave as a
 * legitimate no-row `null`) from "caller explicitly passed `data:
 * undefined`" (a test proving the repository does NOT collapse an
 * unexpected `undefined`/falsy `.maybeSingle()` result into the same
 * legitimate-absence case as a real `null` — Task 028 independent review
 * patch 2, Finding E). `"data" in result` distinguishes them: it is `true`
 * for an explicit `{ data: undefined }` and `false` when the key is
 * omitted entirely, so only the omitted case defaults to `null`.
 */
function fakeReadClient(
  table: string,
  result: { data?: unknown; error?: { message: string } | null },
): SupabaseClient {
  const resolvedData = "data" in result ? result.data : null;

  return {
    from: (calledTable: string) => {
      expect(calledTable).toBe(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: resolvedData, error: result.error ?? null }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

function fakeUpsertClient(result: {
  data?: unknown;
  error?: { message: string } | null;
  captureUpsert?: (payload: unknown, options: unknown) => void;
}): SupabaseClient {
  return {
    from: (table: string) => {
      expect(table).toBe("project_design");
      return {
        upsert: (payload: unknown, options: unknown) => {
          result.captureUpsert?.(payload, options);
          return {
            select: () => ({
              single: async () => ({ data: result.data ?? null, error: result.error ?? null }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("supabaseProjectDesignGateway.getProjectForDesign", () => {
  it("returns null when no project row is found (data: null)", async () => {
    const client = fakeReadClient("projects", { data: null });
    expect(await supabaseProjectDesignGateway.getProjectForDesign(client, PROJECT_ID)).toBeNull();
  });

  it("rejects data: undefined as an unexpected shape rather than treating it as no-row (Finding E)", async () => {
    const client = fakeReadClient("projects", { data: undefined });
    // A resolved (non-throwing) call would necessarily settle to `null` or
    // a valid record — asserting the promise rejects is itself the proof
    // that `undefined` was never silently treated as legitimate absence.
    await expect(
      supabaseProjectDesignGateway.getProjectForDesign(client, PROJECT_ID),
    ).rejects.toThrow();
  });

  it("rejects data: false as an unexpected shape rather than treating it as no-row (Finding E)", async () => {
    const client = fakeReadClient("projects", { data: false });
    await expect(
      supabaseProjectDesignGateway.getProjectForDesign(client, PROJECT_ID),
    ).rejects.toThrow();
  });

  it("maps a valid row", async () => {
    const client = fakeReadClient("projects", {
      data: { id: PROJECT_ID, event_type: "WEDDING" },
    });
    expect(await supabaseProjectDesignGateway.getProjectForDesign(client, PROJECT_ID)).toEqual({
      id: PROJECT_ID,
      eventType: "WEDDING",
    });
  });

  it("throws on a malformed event_type", async () => {
    const client = fakeReadClient("projects", {
      data: { id: PROJECT_ID, event_type: "NOT_A_REAL_TYPE" },
    });
    await expect(
      supabaseProjectDesignGateway.getProjectForDesign(client, PROJECT_ID),
    ).rejects.toThrow();
  });

  it("rejects a type-valid row bound to a different project id than queried (Finding D)", async () => {
    const client = fakeReadClient("projects", {
      data: { id: "99999999-9999-9999-9999-999999999999", event_type: "WEDDING" },
    });
    await expect(
      supabaseProjectDesignGateway.getProjectForDesign(client, PROJECT_ID),
    ).rejects.toThrow();
  });

  it("throws a generic error on a query failure, never the raw DB message", async () => {
    const client = fakeReadClient("projects", { error: { message: "raw postgres detail" } });
    const error = await supabaseProjectDesignGateway
      .getProjectForDesign(client, PROJECT_ID)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });
});

describe("supabaseProjectDesignGateway.getCurrentProjectDesign", () => {
  const validRow = {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    project_id: PROJECT_ID,
    template_version_id: "22222222-2222-2222-2222-222222222222",
    palette_key: "ivory-champagne",
    font_preset_key: "editorial-classic",
    effect_preset_key: "NONE",
    section_settings: { showGallery: true },
    design_settings: { heroHeadline: "Text" },
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
  };

  it("returns null when no row exists (data: null)", async () => {
    const client = fakeReadClient("project_design", { data: null });
    expect(
      await supabaseProjectDesignGateway.getCurrentProjectDesign(client, PROJECT_ID),
    ).toBeNull();
  });

  it("rejects data: undefined as an unexpected shape rather than treating it as no-row (Finding E)", async () => {
    const client = fakeReadClient("project_design", { data: undefined });
    await expect(
      supabaseProjectDesignGateway.getCurrentProjectDesign(client, PROJECT_ID),
    ).rejects.toThrow();
  });

  it("maps a valid row to camelCase", async () => {
    const client = fakeReadClient("project_design", { data: validRow });
    const result = await supabaseProjectDesignGateway.getCurrentProjectDesign(client, PROJECT_ID);

    expect(result).toEqual({
      id: validRow.id,
      projectId: PROJECT_ID,
      templateVersionId: validRow.template_version_id,
      paletteKey: "ivory-champagne",
      fontPresetKey: "editorial-classic",
      effectPresetKey: "NONE",
      sectionSettings: { showGallery: true },
      designSettings: { heroHeadline: "Text" },
      createdAt: validRow.created_at,
      updatedAt: validRow.updated_at,
    });
  });

  it("throws when section_settings is not a plain object", async () => {
    const client = fakeReadClient("project_design", {
      data: { ...validRow, section_settings: "not an object" },
    });
    await expect(
      supabaseProjectDesignGateway.getCurrentProjectDesign(client, PROJECT_ID),
    ).rejects.toThrow();
  });

  it("throws when a settings value is a nested object (unexpected persisted shape)", async () => {
    const client = fakeReadClient("project_design", {
      data: { ...validRow, design_settings: { nested: { a: 1 } } },
    });
    await expect(
      supabaseProjectDesignGateway.getCurrentProjectDesign(client, PROJECT_ID),
    ).rejects.toThrow();
  });

  it("throws on a malformed timestamp", async () => {
    const client = fakeReadClient("project_design", {
      data: { ...validRow, updated_at: "not-a-timestamp" },
    });
    await expect(
      supabaseProjectDesignGateway.getCurrentProjectDesign(client, PROJECT_ID),
    ).rejects.toThrow();
  });

  it("rejects a type-valid row bound to a different project_id than queried (Finding D)", async () => {
    const client = fakeReadClient("project_design", {
      data: { ...validRow, project_id: "99999999-9999-9999-9999-999999999999" },
    });
    await expect(
      supabaseProjectDesignGateway.getCurrentProjectDesign(client, PROJECT_ID),
    ).rejects.toThrow();
  });
});

describe("supabaseProjectDesignGateway.getTemplateVersionForDesign", () => {
  it("returns null when no row exists (data: null)", async () => {
    const client = fakeReadClient("template_versions", { data: null });
    expect(
      await supabaseProjectDesignGateway.getTemplateVersionForDesign(client, "v1"),
    ).toBeNull();
  });

  it("rejects data: undefined as an unexpected shape rather than treating it as no-row (Finding E)", async () => {
    const client = fakeReadClient("template_versions", { data: undefined });
    await expect(
      supabaseProjectDesignGateway.getTemplateVersionForDesign(client, "v1"),
    ).rejects.toThrow();
  });

  it("maps a valid row, passing manifest through raw/unvalidated", async () => {
    const rawManifest = { schemaVersion: 1, anything: "at all" };
    const client = fakeReadClient("template_versions", {
      data: {
        id: "22222222-2222-2222-2222-222222222222",
        template_id: "33333333-3333-3333-3333-333333333333",
        manifest: rawManifest,
        retired_at: null,
      },
    });

    const result = await supabaseProjectDesignGateway.getTemplateVersionForDesign(
      client,
      "22222222-2222-2222-2222-222222222222",
    );

    expect(result).toEqual({
      id: "22222222-2222-2222-2222-222222222222",
      templateId: "33333333-3333-3333-3333-333333333333",
      manifest: rawManifest,
      retiredAt: null,
    });
  });

  it("throws on a malformed retired_at", async () => {
    const client = fakeReadClient("template_versions", {
      data: {
        id: "22222222-2222-2222-2222-222222222222",
        template_id: "33333333-3333-3333-3333-333333333333",
        manifest: {},
        retired_at: 12345,
      },
    });

    await expect(
      supabaseProjectDesignGateway.getTemplateVersionForDesign(
        client,
        "22222222-2222-2222-2222-222222222222",
      ),
    ).rejects.toThrow();
  });

  it("rejects a type-valid row bound to a different id than queried (Finding D)", async () => {
    const client = fakeReadClient("template_versions", {
      data: {
        id: "77777777-7777-7777-7777-777777777777",
        template_id: "33333333-3333-3333-3333-333333333333",
        manifest: {},
        retired_at: null,
      },
    });

    await expect(
      supabaseProjectDesignGateway.getTemplateVersionForDesign(
        client,
        "22222222-2222-2222-2222-222222222222",
      ),
    ).rejects.toThrow();
  });
});

describe("supabaseProjectDesignGateway.getTemplateForDesign", () => {
  it("returns null when no row exists (data: null)", async () => {
    const client = fakeReadClient("templates", { data: null });
    expect(await supabaseProjectDesignGateway.getTemplateForDesign(client, "t1")).toBeNull();
  });

  it("rejects data: undefined as an unexpected shape rather than treating it as no-row (Finding E)", async () => {
    const client = fakeReadClient("templates", { data: undefined });
    await expect(
      supabaseProjectDesignGateway.getTemplateForDesign(client, "t1"),
    ).rejects.toThrow();
  });

  it("maps a valid row", async () => {
    const client = fakeReadClient("templates", {
      data: { id: "33333333-3333-3333-3333-333333333333", event_type: "WEDDING", is_active: true },
    });

    expect(
      await supabaseProjectDesignGateway.getTemplateForDesign(
        client,
        "33333333-3333-3333-3333-333333333333",
      ),
    ).toEqual({
      id: "33333333-3333-3333-3333-333333333333",
      eventType: "WEDDING",
      isActive: true,
    });
  });

  it("throws when is_active is not a boolean", async () => {
    const client = fakeReadClient("templates", {
      data: { id: "33333333-3333-3333-3333-333333333333", event_type: "WEDDING", is_active: "yes" },
    });

    await expect(supabaseProjectDesignGateway.getTemplateForDesign(client, "t1")).rejects.toThrow();
  });

  it("rejects a type-valid row bound to a different id than queried (Finding D)", async () => {
    const client = fakeReadClient("templates", {
      data: { id: "88888888-8888-8888-8888-888888888888", event_type: "WEDDING", is_active: true },
    });

    await expect(
      supabaseProjectDesignGateway.getTemplateForDesign(
        client,
        "33333333-3333-3333-3333-333333333333",
      ),
    ).rejects.toThrow();
  });
});

describe("supabaseProjectDesignGateway.upsertProjectDesign", () => {
  const input: SaveProjectDesignInput = {
    templateVersionId: "22222222-2222-2222-2222-222222222222",
    paletteKey: "ivory-champagne",
    fontPresetKey: "editorial-classic",
    effectPresetKey: "NONE",
    sectionSettings: { showGallery: true },
    designSettings: {},
  };

  it("upserts with onConflict: project_id and the correct snake_case payload", async () => {
    let capturedPayload: unknown;
    let capturedOptions: unknown;

    const client = fakeUpsertClient({
      data: {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        project_id: PROJECT_ID,
        template_version_id: input.templateVersionId,
        palette_key: input.paletteKey,
        font_preset_key: input.fontPresetKey,
        effect_preset_key: input.effectPresetKey,
        section_settings: input.sectionSettings,
        design_settings: input.designSettings,
        created_at: "2026-09-21T00:00:00.000Z",
        updated_at: "2026-09-21T00:00:00.000Z",
      },
      captureUpsert: (payload, options) => {
        capturedPayload = payload;
        capturedOptions = options;
      },
    });

    const result = await supabaseProjectDesignGateway.upsertProjectDesign(
      client,
      PROJECT_ID,
      input,
    );

    expect(capturedPayload).toEqual({
      project_id: PROJECT_ID,
      template_version_id: input.templateVersionId,
      palette_key: input.paletteKey,
      font_preset_key: input.fontPresetKey,
      effect_preset_key: input.effectPresetKey,
      section_settings: input.sectionSettings,
      design_settings: input.designSettings,
    });
    expect(capturedOptions).toEqual({ onConflict: "project_id" });
    expect(result.projectId).toBe(PROJECT_ID);
    expect(result.paletteKey).toBe("ivory-champagne");
  });

  it("throws a generic error on a DB failure, never the raw message", async () => {
    const client = fakeUpsertClient({ error: { message: "raw constraint detail" } });

    const error = await supabaseProjectDesignGateway
      .upsertProjectDesign(client, PROJECT_ID, input)
      .catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw constraint detail");
  });

  it("throws when the upserted row shape is unexpectedly malformed", async () => {
    const client = fakeUpsertClient({ data: { id: "not-a-uuid" } });

    await expect(
      supabaseProjectDesignGateway.upsertProjectDesign(client, PROJECT_ID, input),
    ).rejects.toThrow();
  });

  it("rejects a type-valid returned row bound to a different project_id (Finding D)", async () => {
    const client = fakeUpsertClient({
      data: {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        project_id: "99999999-9999-9999-9999-999999999999",
        template_version_id: input.templateVersionId,
        palette_key: input.paletteKey,
        font_preset_key: input.fontPresetKey,
        effect_preset_key: input.effectPresetKey,
        section_settings: input.sectionSettings,
        design_settings: input.designSettings,
        created_at: "2026-09-21T00:00:00.000Z",
        updated_at: "2026-09-21T00:00:00.000Z",
      },
    });

    await expect(
      supabaseProjectDesignGateway.upsertProjectDesign(client, PROJECT_ID, input),
    ).rejects.toThrow();
  });

  it("rejects a type-valid returned row bound to a different template_version_id than requested (Finding D)", async () => {
    const client = fakeUpsertClient({
      data: {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        project_id: PROJECT_ID,
        template_version_id: "77777777-7777-7777-7777-777777777777",
        palette_key: input.paletteKey,
        font_preset_key: input.fontPresetKey,
        effect_preset_key: input.effectPresetKey,
        section_settings: input.sectionSettings,
        design_settings: input.designSettings,
        created_at: "2026-09-21T00:00:00.000Z",
        updated_at: "2026-09-21T00:00:00.000Z",
      },
    });

    await expect(
      supabaseProjectDesignGateway.upsertProjectDesign(client, PROJECT_ID, input),
    ).rejects.toThrow();
  });
});
