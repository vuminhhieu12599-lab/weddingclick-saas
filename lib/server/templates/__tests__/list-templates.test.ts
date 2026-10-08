import { lookupTemplateEditorManifest } from "../../../../templates/core/production-editor-manifests";
import { describe, expect, it } from "vitest";

import { listTemplates } from "../list-templates";
import type { TemplatesGateway } from "../templates-gateway";
import type { RawTemplateCatalogRow } from "../templates-types";

interface FakeClient {
  marker: string;
}

const staff = {
  userId: "staff-1",
  role: "STAFF" as const,
  displayName: "Test Staff",
  supabase: { marker: "x" } as FakeClient,
};

const VALID_MANIFEST = {
  schemaVersion: 1,
  palettes: ["ivory-champagne"],
  fontPresets: ["editorial-classic"],
  effectPresets: ["NONE"],
  sectionSettingsSchema: {},
  designSettingsSchema: {},
  // Extra raw renderer metadata that Task 028 must never expose.
  rendererComponentHints: { hero: "ElegantEditorialHero" },
};

function createFakeGateway(rows: RawTemplateCatalogRow[]): TemplatesGateway<FakeClient> {
  return {
    async listTemplatesWithVersions() {
      return rows;
    },
  };
}

describe("listTemplates", () => {
  it("returns the complete catalog, including inactive templates and retired versions", async () => {
    const rows: RawTemplateCatalogRow[] = [
      {
        id: "t1",
        code: "elegant-editorial",
        eventType: "WEDDING",
        name: "Elegant Editorial",
        description: null,
        isActive: true,
        sortOrder: 1,
        previewMediaPath: null,
        versions: [
          {
            id: "v1",
            versionNumber: 1,
            rendererKey: "wedding.elegant-editorial.v1",
            manifest: VALID_MANIFEST,
            retiredAt: null,
          },
        ],
      },
      {
        id: "t2",
        code: "retired-template",
        eventType: "WEDDING",
        name: "Retired Template",
        description: null,
        isActive: false,
        sortOrder: 2,
        previewMediaPath: null,
        versions: [
          {
            id: "v2",
            versionNumber: 1,
            rendererKey: "wedding.retired-template.v1",
            manifest: VALID_MANIFEST,
            retiredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ];

    const result = await listTemplates(staff, createFakeGateway(rows), lookupTemplateEditorManifest);

    expect(result).toHaveLength(2);
    expect(result[0].isActive).toBe(true);
    expect(result[1].isActive).toBe(false);
    expect(result[1].versions[0].retiredAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("derives selectable = isActive && retiredAt === null", async () => {
    const rows: RawTemplateCatalogRow[] = [
      {
        id: "t1",
        code: "active-template",
        eventType: "WEDDING",
        name: "Active",
        description: null,
        isActive: true,
        sortOrder: 1,
        previewMediaPath: null,
        versions: [
          { id: "v1", versionNumber: 1, rendererKey: "r1", manifest: VALID_MANIFEST, retiredAt: null },
          {
            id: "v2",
            versionNumber: 2,
            rendererKey: "r2",
            manifest: VALID_MANIFEST,
            retiredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      {
        id: "t2",
        code: "inactive-template",
        eventType: "WEDDING",
        name: "Inactive",
        description: null,
        isActive: false,
        sortOrder: 2,
        previewMediaPath: null,
        versions: [
          { id: "v3", versionNumber: 1, rendererKey: "r3", manifest: VALID_MANIFEST, retiredAt: null },
        ],
      },
    ];

    const result = await listTemplates(staff, createFakeGateway(rows), lookupTemplateEditorManifest);

    expect(result[0].versions[0].selectable).toBe(true);
    expect(result[0].versions[1].selectable).toBe(false);
    expect(result[1].versions[0].selectable).toBe(false);
  });

  it("exposes only the validated six-field design-manifest subset, never raw renderer metadata", async () => {
    const rows: RawTemplateCatalogRow[] = [
      {
        id: "t1",
        code: "elegant-editorial",
        eventType: "WEDDING",
        name: "Elegant Editorial",
        description: null,
        isActive: true,
        sortOrder: 1,
        previewMediaPath: null,
        versions: [
          { id: "v1", versionNumber: 1, rendererKey: "r1", manifest: VALID_MANIFEST, retiredAt: null },
        ],
      },
    ];

    const result = await listTemplates(staff, createFakeGateway(rows), lookupTemplateEditorManifest);

    expect(result[0].versions[0].designManifest).toEqual({
      schemaVersion: 1,
      palettes: ["ivory-champagne"],
      fontPresets: ["editorial-classic"],
      effectPresets: ["NONE"],
      sectionSettingsSchema: {},
      designSettingsSchema: {},
    });
    expect(result[0].versions[0].designManifest).not.toHaveProperty("rendererComponentHints");
  });

  it("throws (fails the whole request) when any version's manifest is malformed", async () => {
    const rows: RawTemplateCatalogRow[] = [
      {
        id: "t1",
        code: "broken-template",
        eventType: "WEDDING",
        name: "Broken",
        description: null,
        isActive: true,
        sortOrder: 1,
        previewMediaPath: null,
        versions: [
          {
            id: "v1",
            versionNumber: 1,
            rendererKey: "r1",
            manifest: { schemaVersion: 2 },
            retiredAt: null,
          },
        ],
      },
    ];

    await expect(listTemplates(staff, createFakeGateway(rows), lookupTemplateEditorManifest)).rejects.toThrow();
  });
});
