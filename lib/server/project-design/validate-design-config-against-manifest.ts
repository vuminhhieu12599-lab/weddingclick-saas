import type { ManifestSettingSpec, TemplateDesignManifestV1 } from "../../domain";
import { ApiError } from "../errors/api-error";
import type { SaveProjectDesignInput } from "./project-design-types";

/**
 * Validates an already structurally-valid SaveProjectDesignInput (from
 * validate-save-project-design-input.ts) against the selected template
 * version's TemplateDesignManifestV1 (from validate-template-design-
 * manifest.ts). Every violation here is a well-formed request that
 * disagrees with the selected template version's declared config surface —
 * ApiError INVARIANT/422 (Task 028 closure §3/§9), never BAD_REQUEST.
 *
 * Manifest schemas are allow-lists, not "all keys required" lists (Task 028
 * closure §7) — a submitted sectionSettings/designSettings object may be a
 * strict subset of the manifest's declared keys; only an UNDECLARED
 * submitted key is rejected. No coercion anywhere — a type/enum mismatch is
 * always rejected outright, never converted.
 */
function assertPresetKeyDeclared(fieldName: string, value: string, declared: string[]): void {
  if (!declared.includes(value)) {
    throw new ApiError(
      "INVARIANT",
      `"${fieldName}" is not a supported value for the selected template version`,
    );
  }
}

function assertValueMatchesSpec(
  fieldName: string,
  key: string,
  value: string | number | boolean,
  spec: ManifestSettingSpec,
): void {
  if (typeof value !== spec.type) {
    throw new ApiError(
      "INVARIANT",
      `"${fieldName}.${key}" does not match the type required by the selected template version`,
    );
  }

  if (spec.type === "string") {
    if (spec.enumValues && !spec.enumValues.includes(value as string)) {
      throw new ApiError(
        "INVARIANT",
        `"${fieldName}.${key}" is not a supported value for the selected template version`,
      );
    }
    return;
  }

  if (spec.type === "number") {
    if (spec.enumValues && !spec.enumValues.includes(value as number)) {
      throw new ApiError(
        "INVARIANT",
        `"${fieldName}.${key}" is not a supported value for the selected template version`,
      );
    }
    return;
  }

  // spec.type === "boolean"
  if (spec.enumValues && !spec.enumValues.includes(value as boolean)) {
    throw new ApiError(
      "INVARIANT",
      `"${fieldName}.${key}" is not a supported value for the selected template version`,
    );
  }
}

function assertSettingsDeclared(
  fieldName: string,
  submitted: Record<string, string | number | boolean>,
  schema: Record<string, ManifestSettingSpec>,
): void {
  for (const key of Object.keys(submitted)) {
    const spec = schema[key];

    if (!spec) {
      throw new ApiError(
        "INVARIANT",
        `"${fieldName}.${key}" is not a supported setting for the selected template version`,
      );
    }

    assertValueMatchesSpec(fieldName, key, submitted[key], spec);
  }
}

export function validateDesignConfigAgainstManifest(
  input: SaveProjectDesignInput,
  manifest: TemplateDesignManifestV1,
): void {
  assertPresetKeyDeclared("paletteKey", input.paletteKey, manifest.palettes);
  assertPresetKeyDeclared("fontPresetKey", input.fontPresetKey, manifest.fontPresets);
  assertPresetKeyDeclared("effectPresetKey", input.effectPresetKey, manifest.effectPresets);

  assertSettingsDeclared("sectionSettings", input.sectionSettings, manifest.sectionSettingsSchema);
  assertSettingsDeclared("designSettings", input.designSettings, manifest.designSettingsSchema);
}
