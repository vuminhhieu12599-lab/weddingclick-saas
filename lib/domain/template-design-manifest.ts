/**
 * Task 028 — renderer-independent design-config validation contract.
 *
 * This is deliberately NOT the entire future template renderer manifest.
 * `template_versions.manifest` (JSONB, migration 0010) may carry additional
 * Task-029+ renderer/layout/animation metadata alongside these fields —
 * Task 028 reads and validates only the six fields below, ignores every
 * other raw top-level key, and never interprets renderer-specific metadata.
 * Task 029 may add further declarative fields to the raw manifest without
 * changing this contract's shape or semantics.
 *
 * Purpose: (1) validate a `project_design` write against the selected
 * template version's declared config surface, (2) later drive config-option
 * choices in an editor UI. It carries no visual/layout/component/animation
 * meaning — see docs/TEMPLATE_SYSTEM.md for that (Task 029 concern).
 */
export interface TemplateDesignManifestV1 {
  schemaVersion: 1;
  palettes: string[];
  fontPresets: string[];
  effectPresets: string[];
  sectionSettingsSchema: Record<string, ManifestSettingSpec>;
  designSettingsSchema: Record<string, ManifestSettingSpec>;
}

/**
 * Discriminated by `type` so a `boolean` spec can only ever declare a
 * `boolean[]` `enumValues` (a plain `Array<string | number>` could not
 * correctly represent a boolean enum).
 */
export type ManifestSettingSpec =
  | { type: "string"; enumValues?: string[] }
  | { type: "number"; enumValues?: number[] }
  | { type: "boolean"; enumValues?: boolean[] };
