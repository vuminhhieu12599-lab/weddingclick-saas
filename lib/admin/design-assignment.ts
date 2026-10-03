import type { EventType, ManifestSettingSpec, TemplateDesignManifestV1 } from "../domain";
import type { ProjectDesignRecord } from "../server/project-design/project-design-types";
import type {
  TemplateCatalogEntry,
  TemplateVersionCatalogEntry,
} from "../server/templates/templates-types";

/**
 * Minimal staff template assignment (Design tab). Builds a full
 * `PUT /api/v2/internal/projects/[id]/design` body (docs/API_CONTRACT.md
 * §13.3) for one exact, staff-chosen `templateVersionId`.
 *
 * Nothing is ever implicitly chosen: no latest/first/fallback version, and
 * a preset key is filled only when it is unambiguous — the selected
 * version's manifest declares exactly one option, or the Project's current
 * key is already declared by it. Anything else is reported as not
 * assignable here (a full Design Editor concern). The server re-validates
 * every value against the pinned `template_versions` row; `rendererKey`
 * is never sent.
 */
export type DesignAssignmentBody = Pick<
  ProjectDesignRecord,
  | "templateVersionId"
  | "paletteKey"
  | "fontPresetKey"
  | "effectPresetKey"
  | "sectionSettings"
  | "designSettings"
>;

export type DesignAssignmentResult =
  | { ok: true; body: DesignAssignmentBody }
  | { ok: false; reason: string };

export interface TemplateVersionOption {
  template: TemplateCatalogEntry;
  version: TemplateVersionCatalogEntry;
}

/** Every catalog version the staff member may pick for this Project's event type (exact rows; never collapsed to "latest"). */
export function listTemplateVersionOptions(
  catalog: readonly TemplateCatalogEntry[],
  eventType: EventType,
  currentTemplateVersionId: string | null,
): TemplateVersionOption[] {
  const options: TemplateVersionOption[] = [];
  for (const template of catalog) {
    if (template.eventType !== eventType) {
      continue;
    }
    for (const version of template.versions) {
      // An unselectable version stays listed only when it is the Project's current one (grandfathered, §13.3).
      if (version.selectable || version.id === currentTemplateVersionId) {
        options.push({ template, version });
      }
    }
  }
  return options;
}

export function findTemplateVersionOption(
  catalog: readonly TemplateCatalogEntry[],
  templateVersionId: string,
): TemplateVersionOption | null {
  for (const template of catalog) {
    const version = template.versions.find((entry) => entry.id === templateVersionId);
    if (version) {
      return { template, version };
    }
  }
  return null;
}

function resolvePresetKey(declared: readonly string[], currentKey: string | null): string | null {
  if (declared.length === 1) {
    return declared[0];
  }
  if (currentKey !== null && declared.includes(currentKey)) {
    return currentKey;
  }
  return null;
}

function valueMatchesSpec(value: string | number | boolean, spec: ManifestSettingSpec): boolean {
  if (typeof value !== spec.type) {
    return false;
  }
  if (!spec.enumValues) {
    return true;
  }
  return (spec.enumValues as readonly (string | number | boolean)[]).includes(value);
}

/** Keeps only the current settings the selected manifest still declares; never adds a value. */
function carryOverSettings(
  current: Record<string, string | number | boolean> | null,
  schema: Record<string, ManifestSettingSpec>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!current) {
    return result;
  }
  for (const key of Object.keys(current)) {
    const spec = Object.prototype.hasOwnProperty.call(schema, key) ? schema[key] : undefined;
    if (spec && valueMatchesSpec(current[key], spec)) {
      result[key] = current[key];
    }
  }
  return result;
}

export function buildDesignAssignmentBody(
  version: TemplateVersionCatalogEntry,
  currentDesign: ProjectDesignRecord | null,
): DesignAssignmentResult {
  if (currentDesign !== null && currentDesign.templateVersionId === version.id) {
    return {
      ok: true,
      body: {
        templateVersionId: currentDesign.templateVersionId,
        paletteKey: currentDesign.paletteKey,
        fontPresetKey: currentDesign.fontPresetKey,
        effectPresetKey: currentDesign.effectPresetKey,
        sectionSettings: currentDesign.sectionSettings,
        designSettings: currentDesign.designSettings,
      },
    };
  }

  if (!version.selectable) {
    return { ok: false, reason: "Phiên bản mẫu này không còn được phép chọn mới." };
  }

  const manifest: TemplateDesignManifestV1 = version.designManifest;
  const paletteKey = resolvePresetKey(manifest.palettes, currentDesign?.paletteKey ?? null);
  const fontPresetKey = resolvePresetKey(manifest.fontPresets, currentDesign?.fontPresetKey ?? null);
  const effectPresetKey = resolvePresetKey(manifest.effectPresets, currentDesign?.effectPresetKey ?? null);

  if (paletteKey === null || fontPresetKey === null || effectPresetKey === null) {
    return {
      ok: false,
      reason: "Phiên bản mẫu này có nhiều tuỳ chọn màu/font/hiệu ứng — cần trình chỉnh sửa thiết kế để chọn.",
    };
  }

  return {
    ok: true,
    body: {
      templateVersionId: version.id,
      paletteKey,
      fontPresetKey,
      effectPresetKey,
      sectionSettings: carryOverSettings(currentDesign?.sectionSettings ?? null, manifest.sectionSettingsSchema),
      designSettings: carryOverSettings(currentDesign?.designSettings ?? null, manifest.designSettingsSchema),
    },
  };
}
