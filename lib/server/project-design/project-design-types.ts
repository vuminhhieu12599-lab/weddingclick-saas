import type { EventType } from "../../domain";

/**
 * Project Design domain shapes (Task 028).
 *
 * Mirrors migration 0011_project_design.sql / docs/PHYSICAL_DATABASE_PLAN.md
 * §2.12 exactly — no invented fields. `id`, `projectId`, `createdAt`,
 * `updatedAt` are server-owned and never accepted as PUT input.
 */
export interface ProjectDesignRecord {
  id: string;
  projectId: string;
  templateVersionId: string;
  paletteKey: string;
  fontPresetKey: string;
  effectPresetKey: string;
  sectionSettings: Record<string, string | number | boolean>;
  designSettings: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Normalized, structurally-valid PUT body — exactly the six caller-editable
 * fields. Produced by validate-save-project-design-input.ts; string fields
 * are already trimmed, sectionSettings/designSettings values are already
 * restricted to string | finite number | boolean with no nested
 * object/array. Not yet validated against any template's manifest — that is
 * a separate step (validate-design-config-against-manifest.ts) requiring the
 * selected template version's manifest to be loaded first.
 */
export interface SaveProjectDesignInput {
  templateVersionId: string;
  paletteKey: string;
  fontPresetKey: string;
  effectPresetKey: string;
  sectionSettings: Record<string, string | number | boolean>;
  designSettings: Record<string, string | number | boolean>;
}

/** Minimal Project projection needed for design use cases (existence + event-type compatibility). */
export interface ProjectForDesign {
  id: string;
  eventType: EventType;
}

/**
 * Minimal template_versions projection needed for design use cases. `manifest`
 * is intentionally left `unknown` here — it is untrusted raw JSONB until
 * validate-template-design-manifest.ts extracts/validates the Task-028
 * subset from it.
 */
export interface TemplateVersionForDesign {
  id: string;
  templateId: string;
  /** TE-05A-H1: the version's exact stored renderer key (server-read, never from a request). */
  rendererKey: string;
  manifest: unknown;
  retiredAt: string | null;
}

/** Minimal parent templates projection needed for design use cases. */
export interface TemplateForDesign {
  id: string;
  eventType: EventType;
  isActive: boolean;
}
