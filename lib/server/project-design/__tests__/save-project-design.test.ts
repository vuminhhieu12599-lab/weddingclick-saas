import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import { describe, expect, it, vi } from "vitest";

import type { EventType } from "../../../domain";
import { ApiError } from "../../errors/api-error";
import type { ProjectDesignGateway } from "../project-design-gateway";
import type {
  ProjectDesignRecord,
  ProjectForDesign,
  SaveProjectDesignInput,
  TemplateForDesign,
  TemplateVersionForDesign,
} from "../project-design-types";
import { saveProjectDesign } from "../save-project-design";

interface FakeClient {
  marker: string;
}

const staff = {
  userId: "staff-1",
  role: "STAFF" as const,
  displayName: "Test Staff",
  supabase: { marker: "x" } as FakeClient,
};

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const ACTIVE_VERSION_ID = "22222222-2222-2222-2222-222222222222";
const TEMPLATE_ID = "33333333-3333-3333-3333-333333333333";
const RETIRED_VERSION_ID = "44444444-4444-4444-4444-444444444444";
const INACTIVE_PARENT_VERSION_ID = "55555555-5555-5555-5555-555555555555";
const INACTIVE_TEMPLATE_ID = "66666666-6666-6666-6666-666666666666";
const OTHER_ACTIVE_VERSION_ID = "77777777-7777-7777-7777-777777777777";
const MISMATCHED_EVENT_VERSION_ID = "88888888-8888-8888-8888-888888888888";
const MISMATCHED_EVENT_TEMPLATE_ID = "99999999-9999-9999-9999-999999999999";
const MISSING_PARENT_VERSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MISSING_PARENT_TEMPLATE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const UNKNOWN_VERSION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const VALID_MANIFEST = {
  schemaVersion: 1,
  palettes: ["ivory-champagne"],
  fontPresets: ["editorial-classic"],
  effectPresets: ["NONE"],
  sectionSettingsSchema: { showGallery: { type: "boolean" } },
  designSettingsSchema: { heroHeadline: { type: "string" } },
};

const MALFORMED_MANIFEST = { schemaVersion: 2 };

const project: ProjectForDesign = { id: PROJECT_ID, eventType: "WEDDING" };

const templateVersions: Record<string, TemplateVersionForDesign> = {
  [ACTIVE_VERSION_ID]: {
    id: ACTIVE_VERSION_ID,
    templateId: TEMPLATE_ID,
    rendererKey: "wedding.elegant-editorial.v1",
    manifest: VALID_MANIFEST,
    retiredAt: null,
  },
  [OTHER_ACTIVE_VERSION_ID]: {
    id: OTHER_ACTIVE_VERSION_ID,
    templateId: TEMPLATE_ID,
    rendererKey: "wedding.elegant-editorial.v1",
    manifest: VALID_MANIFEST,
    retiredAt: null,
  },
  [RETIRED_VERSION_ID]: {
    id: RETIRED_VERSION_ID,
    templateId: TEMPLATE_ID,
    rendererKey: "wedding.elegant-editorial.v1",
    manifest: VALID_MANIFEST,
    retiredAt: "2026-01-01T00:00:00.000Z",
  },
  [INACTIVE_PARENT_VERSION_ID]: {
    id: INACTIVE_PARENT_VERSION_ID,
    templateId: INACTIVE_TEMPLATE_ID,
    rendererKey: "wedding.elegant-editorial.v1",
    manifest: VALID_MANIFEST,
    retiredAt: null,
  },
  [MISMATCHED_EVENT_VERSION_ID]: {
    id: MISMATCHED_EVENT_VERSION_ID,
    templateId: MISMATCHED_EVENT_TEMPLATE_ID,
    rendererKey: "wedding.elegant-editorial.v1",
    manifest: VALID_MANIFEST,
    retiredAt: null,
  },
  [MISSING_PARENT_VERSION_ID]: {
    id: MISSING_PARENT_VERSION_ID,
    templateId: MISSING_PARENT_TEMPLATE_ID,
    rendererKey: "wedding.elegant-editorial.v1",
    manifest: VALID_MANIFEST,
    retiredAt: null,
  },
};

const templates: Record<string, TemplateForDesign> = {
  [TEMPLATE_ID]: { id: TEMPLATE_ID, eventType: "WEDDING", isActive: true },
  [INACTIVE_TEMPLATE_ID]: { id: INACTIVE_TEMPLATE_ID, eventType: "WEDDING", isActive: false },
  [MISMATCHED_EVENT_TEMPLATE_ID]: {
    id: MISMATCHED_EVENT_TEMPLATE_ID,
    eventType: "OTHER" as unknown as EventType,
    isActive: true,
  },
};

function validBody(overrides?: Partial<Record<string, unknown>>): unknown {
  return {
    templateVersionId: ACTIVE_VERSION_ID,
    paletteKey: "ivory-champagne",
    fontPresetKey: "editorial-classic",
    effectPresetKey: "NONE",
    sectionSettings: {},
    designSettings: {},
    ...overrides,
  };
}

function existingDesign(templateVersionId: string): ProjectDesignRecord {
  return {
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    projectId: PROJECT_ID,
    templateVersionId,
    paletteKey: "ivory-champagne",
    fontPresetKey: "editorial-classic",
    effectPresetKey: "NONE",
    sectionSettings: {},
    designSettings: {},
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function createFakeGateway(options?: {
  projectExists?: boolean;
  existingDesign?: ProjectDesignRecord | null;
  templateVersionOverride?: TemplateVersionForDesign | null | "use-map";
  templateOverride?: TemplateForDesign | null | "use-map";
  upsertResult?: ProjectDesignRecord;
}): {
  gateway: ProjectDesignGateway<FakeClient>;
  upsertSpy: ReturnType<typeof vi.fn>;
} {
  const upsertSpy = vi.fn(async (_client: FakeClient, projectId: string, input: SaveProjectDesignInput) => {
    return (
      options?.upsertResult ?? {
        id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        projectId,
        templateVersionId: input.templateVersionId,
        paletteKey: input.paletteKey,
        fontPresetKey: input.fontPresetKey,
        effectPresetKey: input.effectPresetKey,
        sectionSettings: input.sectionSettings,
        designSettings: input.designSettings,
        createdAt: "2026-09-21T00:00:00.000Z",
        updatedAt: "2026-09-21T00:00:00.000Z",
      }
    );
  });

  const gateway: ProjectDesignGateway<FakeClient> = {
    async getProjectForDesign() {
      return options?.projectExists === false ? null : project;
    },
    async getCurrentProjectDesign() {
      return options?.existingDesign ?? null;
    },
    async getTemplateVersionForDesign(_client, templateVersionId) {
      if (options?.templateVersionOverride !== undefined && options.templateVersionOverride !== "use-map") {
        return options.templateVersionOverride;
      }
      return templateVersions[templateVersionId] ?? null;
    },
    async getTemplateForDesign(_client, templateId) {
      if (options?.templateOverride !== undefined && options.templateOverride !== "use-map") {
        return options.templateOverride;
      }
      return templates[templateId] ?? null;
    },
    upsertProjectDesign: upsertSpy,
  };

  return { gateway, upsertSpy };
}

describe("saveProjectDesign", () => {
  it("rejects a malformed project id", async () => {
    const { gateway } = createFakeGateway();
    await expect(saveProjectDesign("not-a-uuid", validBody(), staff, gateway, lookupTemplateEditorManifest)).rejects.toThrow(
      ApiError,
    );
  });

  it("throws NOT_FOUND when the Project does not exist", async () => {
    const { gateway } = createFakeGateway({ projectExists: false });
    await expect(
      saveProjectDesign(PROJECT_ID, validBody(), staff, gateway, lookupTemplateEditorManifest),
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("throws NOT_FOUND when the template version does not exist", async () => {
    const { gateway } = createFakeGateway();
    await expect(
      saveProjectDesign(
        PROJECT_ID,
        validBody({ templateVersionId: UNKNOWN_VERSION_ID }),
        staff,
        gateway, lookupTemplateEditorManifest
      ),
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("throws a plain (non-ApiError) Error when the parent template row is unexpectedly missing", async () => {
    const { gateway } = createFakeGateway();
    await expect(
      saveProjectDesign(
        PROJECT_ID,
        validBody({ templateVersionId: MISSING_PARENT_VERSION_ID }),
        staff,
        gateway, lookupTemplateEditorManifest
      ),
    ).rejects.toThrow(Error);
    await expect(
      saveProjectDesign(
        PROJECT_ID,
        validBody({ templateVersionId: MISSING_PARENT_VERSION_ID }),
        staff,
        gateway, lookupTemplateEditorManifest
      ),
    ).rejects.not.toBeInstanceOf(ApiError);
  });

  it("throws a plain (non-ApiError) Error when the persisted manifest is malformed", async () => {
    const { gateway } = createFakeGateway({
      templateVersionOverride: {
        id: ACTIVE_VERSION_ID,
        templateId: TEMPLATE_ID,
        rendererKey: "wedding.elegant-editorial.v1",
        manifest: MALFORMED_MANIFEST,
        retiredAt: null,
      },
    });

    await expect(saveProjectDesign(PROJECT_ID, validBody(), staff, gateway, lookupTemplateEditorManifest)).rejects.not.toBeInstanceOf(
      ApiError,
    );
  });

  it("throws INVARIANT on event-type mismatch", async () => {
    const { gateway } = createFakeGateway();
    await expect(
      saveProjectDesign(
        PROJECT_ID,
        validBody({ templateVersionId: MISMATCHED_EVENT_VERSION_ID }),
        staff,
        gateway, lookupTemplateEditorManifest
      ),
    ).rejects.toMatchObject({ kind: "INVARIANT" });
  });

  it("throws INVARIANT on initial selection of an inactive-parent template version", async () => {
    const { gateway } = createFakeGateway();
    await expect(
      saveProjectDesign(
        PROJECT_ID,
        validBody({ templateVersionId: INACTIVE_PARENT_VERSION_ID }),
        staff,
        gateway, lookupTemplateEditorManifest
      ),
    ).rejects.toMatchObject({ kind: "INVARIANT" });
  });

  it("throws INVARIANT on initial selection of a retired version", async () => {
    const { gateway } = createFakeGateway();
    await expect(
      saveProjectDesign(
        PROJECT_ID,
        validBody({ templateVersionId: RETIRED_VERSION_ID }),
        staff,
        gateway, lookupTemplateEditorManifest
      ),
    ).rejects.toMatchObject({ kind: "INVARIANT" });
  });

  it("throws INVARIANT when changing an existing design to an inactive-parent version", async () => {
    const { gateway } = createFakeGateway({ existingDesign: existingDesign(ACTIVE_VERSION_ID) });
    await expect(
      saveProjectDesign(
        PROJECT_ID,
        validBody({ templateVersionId: INACTIVE_PARENT_VERSION_ID }),
        staff,
        gateway, lookupTemplateEditorManifest
      ),
    ).rejects.toMatchObject({ kind: "INVARIANT" });
  });

  it("throws INVARIANT when changing an existing design to a retired version", async () => {
    const { gateway } = createFakeGateway({ existingDesign: existingDesign(ACTIVE_VERSION_ID) });
    await expect(
      saveProjectDesign(
        PROJECT_ID,
        validBody({ templateVersionId: RETIRED_VERSION_ID }),
        staff,
        gateway, lookupTemplateEditorManifest
      ),
    ).rejects.toMatchObject({ kind: "INVARIANT" });
  });

  it("allows updating config when templateVersionId is unchanged even though that version is now retired", async () => {
    const { gateway, upsertSpy } = createFakeGateway({
      existingDesign: existingDesign(RETIRED_VERSION_ID),
    });

    await saveProjectDesign(
      PROJECT_ID,
      validBody({ templateVersionId: RETIRED_VERSION_ID }),
      staff,
      gateway, lookupTemplateEditorManifest
    );

    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it("allows updating config when templateVersionId is unchanged even though its parent template is now inactive", async () => {
    const { gateway, upsertSpy } = createFakeGateway({
      existingDesign: existingDesign(INACTIVE_PARENT_VERSION_ID),
    });

    await saveProjectDesign(
      PROJECT_ID,
      validBody({ templateVersionId: INACTIVE_PARENT_VERSION_ID }),
      staff,
      gateway, lookupTemplateEditorManifest
    );

    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it("allows changing to a different, currently active/selectable version", async () => {
    const { gateway, upsertSpy } = createFakeGateway({
      existingDesign: existingDesign(ACTIVE_VERSION_ID),
    });

    await saveProjectDesign(
      PROJECT_ID,
      validBody({ templateVersionId: OTHER_ACTIVE_VERSION_ID }),
      staff,
      gateway, lookupTemplateEditorManifest
    );

    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it("accepts a supported palette/font/effect combination and returns the saved record", async () => {
    const { gateway } = createFakeGateway();

    const result = await saveProjectDesign(PROJECT_ID, validBody(), staff, gateway, lookupTemplateEditorManifest);

    expect(result.templateVersionId).toBe(ACTIVE_VERSION_ID);
    expect(result.paletteKey).toBe("ivory-champagne");
  });

  it("throws INVARIANT for an unsupported preset key", async () => {
    const { gateway } = createFakeGateway();
    await expect(
      saveProjectDesign(PROJECT_ID, validBody({ paletteKey: "not-declared" }), staff, gateway, lookupTemplateEditorManifest),
    ).rejects.toMatchObject({ kind: "INVARIANT" });
  });

  it("throws INVARIANT for an undeclared config key", async () => {
    const { gateway } = createFakeGateway();
    await expect(
      saveProjectDesign(
        PROJECT_ID,
        validBody({ sectionSettings: { undeclaredKey: true } }),
        staff,
        gateway, lookupTemplateEditorManifest
      ),
    ).rejects.toMatchObject({ kind: "INVARIANT" });
  });

  it("throws INVARIANT for a wrong config primitive type", async () => {
    const { gateway } = createFakeGateway();
    await expect(
      saveProjectDesign(
        PROJECT_ID,
        validBody({ sectionSettings: { showGallery: "not-a-boolean" } }),
        staff,
        gateway, lookupTemplateEditorManifest
      ),
    ).rejects.toMatchObject({ kind: "INVARIANT" });
  });

  it("passes the normalized (trimmed) preset keys to the gateway", async () => {
    const { gateway, upsertSpy } = createFakeGateway();

    await saveProjectDesign(
      PROJECT_ID,
      validBody({ paletteKey: "  ivory-champagne  " }),
      staff,
      gateway, lookupTemplateEditorManifest
    );

    expect(upsertSpy).toHaveBeenCalledWith(
      staff.supabase,
      PROJECT_ID,
      expect.objectContaining({ paletteKey: "ivory-champagne" }),
    );
  });
});

describe("saveProjectDesign — TE-05A-H1 registered renderer guard", () => {
  const unsupported: TemplateVersionForDesign = {
    id: OTHER_ACTIVE_VERSION_ID,
    templateId: TEMPLATE_ID,
    rendererKey: "wedding.unknown.v1",
    manifest: VALID_MANIFEST,
    retiredAt: null,
  };
  const body = () => validBody({ templateVersionId: OTHER_ACTIVE_VERSION_ID });

  it("rejects a NEW selection whose DB renderer key is not a registered production renderer (422, no write)", async () => {
    const { gateway, upsertSpy } = createFakeGateway({ templateVersionOverride: unsupported });
    await expect(saveProjectDesign(PROJECT_ID, body(), staff, gateway, lookupTemplateEditorManifest)).rejects.toMatchObject({
      kind: "INVARIANT",
      message: "Selected template version is not available for new selection",
    });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("uses exact lookup only: near-miss keys never alias a registered renderer", async () => {
    for (const rendererKey of ["wedding.elegant-editorial", "wedding.elegant-editorial.v2", "Wedding.Elegant-Editorial.v1", " wedding.elegant-editorial.v1", "latest"]) {
      const { gateway, upsertSpy } = createFakeGateway({ templateVersionOverride: { ...unsupported, rendererKey } });
      await expect(saveProjectDesign(PROJECT_ID, body(), staff, gateway, lookupTemplateEditorManifest)).rejects.toMatchObject({ kind: "INVARIANT" });
      expect(upsertSpy).not.toHaveBeenCalled();
    }
  });

  it("looks up the renderer key read from the DB version row, never from the request body", async () => {
    const lookup = vi.fn(lookupTemplateEditorManifest);
    const { gateway } = createFakeGateway({ templateVersionOverride: unsupported });
    await expect(saveProjectDesign(PROJECT_ID, { ...(body() as object), rendererKey: "wedding.elegant-editorial.v1" }, staff, gateway, lookup)).rejects.toMatchObject({
      kind: "BAD_REQUEST",
    });
    expect(lookup).not.toHaveBeenCalled();
    await expect(saveProjectDesign(PROJECT_ID, body(), staff, gateway, lookup)).rejects.toMatchObject({ kind: "INVARIANT" });
    expect(lookup.mock.calls).toEqual([["wedding.unknown.v1"]]);
  });

  it("keeps an UNCHANGED historical selection editable (grandfathered like a retired version)", async () => {
    const { gateway, upsertSpy } = createFakeGateway({ templateVersionOverride: unsupported, existingDesign: existingDesign(OTHER_ACTIVE_VERSION_ID) });
    await saveProjectDesign(PROJECT_ID, body(), staff, gateway, lookupTemplateEditorManifest);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it("supported Elegant Editorial and Vietnamese Heritage new selections are unchanged", async () => {
    for (const rendererKey of ["wedding.elegant-editorial.v1", "wedding.vietnamese-heritage.v1"]) {
      const { gateway, upsertSpy } = createFakeGateway({ templateVersionOverride: { ...unsupported, rendererKey } });
      await saveProjectDesign(PROJECT_ID, body(), staff, gateway, lookupTemplateEditorManifest);
      expect(upsertSpy, rendererKey).toHaveBeenCalledTimes(1);
    }
  });

  it("retired / inactive rules are unchanged for a registered renderer", async () => {
    const { gateway } = createFakeGateway();
    await expect(saveProjectDesign(PROJECT_ID, validBody({ templateVersionId: RETIRED_VERSION_ID }), staff, gateway, lookupTemplateEditorManifest)).rejects.toMatchObject({ kind: "INVARIANT" });
    await expect(saveProjectDesign(PROJECT_ID, validBody({ templateVersionId: INACTIVE_PARENT_VERSION_ID }), staff, gateway, lookupTemplateEditorManifest)).rejects.toMatchObject({ kind: "INVARIANT" });
  });
});
