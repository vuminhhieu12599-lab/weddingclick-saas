import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { TemplateDesignManifestV1 } from "../../domain";
import type { ProjectDesignRecord } from "../../server/project-design/project-design-types";
import type { TemplateCatalogEntry, TemplateVersionCatalogEntry } from "../../server/templates/templates-types";
import {
  buildDesignAssignmentBody,
  findTemplateVersionOption,
  listTemplateVersionOptions,
} from "../design-assignment";

/**
 * Minimal staff template assignment: exact version selection, no implicit
 * latest/first/default, unambiguous preset derivation only, and the body
 * never carries server-derived fields (rendererKey etc.).
 */

const SINGLE: TemplateDesignManifestV1 = {
  schemaVersion: 1,
  palettes: ["green-ivory"],
  fontPresets: ["editorial-classic"],
  effectPresets: ["STANDARD"],
  sectionSettingsSchema: { gallery: { type: "boolean" }, music: { type: "boolean" } },
  designSettingsSchema: {},
};

const MULTI: TemplateDesignManifestV1 = { ...SINGLE, palettes: ["a", "b"] };

function version(id: string, versionNumber: number, overrides: Partial<TemplateVersionCatalogEntry> = {}): TemplateVersionCatalogEntry {
  return {
    id,
    versionNumber,
    rendererKey: `wedding.fixture.v${versionNumber}`,
    designManifest: SINGLE,
    editorManifest: null,
    retiredAt: null,
    selectable: true,
    ...overrides,
  };
}

const V1 = version("aaaaaaaa-0000-4000-8000-000000000001", 1);
const V2 = version("aaaaaaaa-0000-4000-8000-000000000002", 2);
const RETIRED = version("aaaaaaaa-0000-4000-8000-000000000003", 3, { retiredAt: "2026-01-01T00:00:00Z", selectable: false });
const MULTI_V = version("bbbbbbbb-0000-4000-8000-000000000001", 1, { designManifest: MULTI });

const CATALOG: TemplateCatalogEntry[] = [
  {
    id: "cccccccc-0000-4000-8000-000000000001",
    code: "fixture-editorial",
    eventType: "WEDDING",
    name: "Fixture Editorial",
    description: null,
    isActive: true,
    sortOrder: 1,
    previewMediaPath: null,
    versions: [V1, V2, RETIRED],
  },
  {
    id: "cccccccc-0000-4000-8000-000000000002",
    code: "fixture-multi",
    eventType: "WEDDING",
    name: "Fixture Multi",
    description: null,
    isActive: true,
    sortOrder: 2,
    previewMediaPath: null,
    versions: [MULTI_V],
  },
];

function design(overrides: Partial<ProjectDesignRecord> = {}): ProjectDesignRecord {
  return {
    id: "dddddddd-0000-4000-8000-000000000001",
    projectId: "eeeeeeee-0000-4000-8000-000000000001",
    templateVersionId: V1.id,
    paletteKey: "green-ivory",
    fontPresetKey: "editorial-classic",
    effectPresetKey: "STANDARD",
    sectionSettings: { gallery: false },
    designSettings: {},
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("listTemplateVersionOptions", () => {
  it("lists every selectable version as its own exact option (no latest collapse)", () => {
    const ids = listTemplateVersionOptions(CATALOG, "WEDDING", null).map((option) => option.version.id);
    expect(ids).toEqual([V1.id, V2.id, MULTI_V.id]);
  });

  it("keeps an unselectable version only when it is the Project's current one", () => {
    expect(listTemplateVersionOptions(CATALOG, "WEDDING", RETIRED.id).map((o) => o.version.id)).toContain(RETIRED.id);
  });

  it("excludes templates of another event type", () => {
    const other = [{ ...CATALOG[0], eventType: "OTHER" as unknown as "WEDDING" }];
    expect(listTemplateVersionOptions(other, "WEDDING", null)).toEqual([]);
  });

  it("finds an exact version and returns null for an unknown id", () => {
    expect(findTemplateVersionOption(CATALOG, V2.id)?.version).toBe(V2);
    expect(findTemplateVersionOption(CATALOG, "ffffffff-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("buildDesignAssignmentBody", () => {
  it("initial assignment: saves the exact selected version and the sole declared presets", () => {
    const result = buildDesignAssignmentBody(V2, null);
    expect(result).toEqual({
      ok: true,
      body: {
        templateVersionId: V2.id,
        paletteKey: "green-ivory",
        fontPresetKey: "editorial-classic",
        effectPresetKey: "STANDARD",
        sectionSettings: {},
        designSettings: {},
      },
    });
  });

  it("never sends server-derived fields", () => {
    const result = buildDesignAssignmentBody(V1, null);
    if (!result.ok) throw new Error("expected ok");
    expect(Object.keys(result.body).sort()).toEqual(
      ["designSettings", "effectPresetKey", "fontPresetKey", "paletteKey", "sectionSettings", "templateVersionId"],
    );
  });

  it("unchanged selection re-sends the current design verbatim (grandfathered)", () => {
    const current = design({ templateVersionId: RETIRED.id });
    const result = buildDesignAssignmentBody(RETIRED, current);
    expect(result.ok && result.body).toEqual({
      templateVersionId: RETIRED.id,
      paletteKey: current.paletteKey,
      fontPresetKey: current.fontPresetKey,
      effectPresetKey: current.effectPresetKey,
      sectionSettings: current.sectionSettings,
      designSettings: current.designSettings,
    });
  });

  it("rejects a new selection of an unselectable version", () => {
    expect(buildDesignAssignmentBody(RETIRED, null).ok).toBe(false);
    expect(buildDesignAssignmentBody(RETIRED, design()).ok).toBe(false);
  });

  it("refuses to guess when a manifest declares several options and none is current", () => {
    expect(buildDesignAssignmentBody(MULTI_V, null)).toMatchObject({ ok: false });
  });

  it("keeps a current preset key that the multi-option manifest declares", () => {
    const result = buildDesignAssignmentBody(MULTI_V, design({ paletteKey: "b" }));
    expect(result.ok && result.body.paletteKey).toBe("b");
  });

  it("carries over only still-declared, type-valid settings on a version change", () => {
    const current = design({ sectionSettings: { gallery: false, music: "yes", unknown: true } });
    const result = buildDesignAssignmentBody(V2, current);
    expect(result.ok && result.body.sectionSettings).toEqual({ gallery: false });
  });
});

describe("static boundaries", () => {
  const root = join(__dirname, "..", "..", "..");
  const files = [
    "lib/admin/design-assignment.ts",
    "lib/admin/admin-api-client.ts",
    "app/admin/v2/projects/[projectId]/_components/design-tab.tsx",
  ].map((file) => readFileSync(join(root, file), "utf8"));

  it("hard-codes no template/version UUID and no Elegant Editorial identity", () => {
    for (const source of files) {
      expect(source).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(source).not.toMatch(/elegant-editorial|Elegant Editorial/);
    }
  });

  it("uses no service role, direct Supabase write, publish or invitation_versions path", () => {
    for (const source of files) {
      expect(source).not.toMatch(/service_role|SERVICE_ROLE|createClient|\.from\(|invitation_versions|\/publish|rendererKey:/);
    }
  });

  it("never picks a version implicitly (no latest/first/sort-based choice)", () => {
    for (const source of files) {
      expect(source).not.toMatch(/versions\[0\]|\.at\(-1\)|Math\.max|\.sort\(/);
    }
  });
});
