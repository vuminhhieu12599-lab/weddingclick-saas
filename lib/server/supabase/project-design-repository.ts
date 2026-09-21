import type { SupabaseClient } from "@supabase/supabase-js";

import { EVENT_TYPES, type EventType } from "../../domain";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";
import type { ProjectDesignGateway } from "../project-design/project-design-gateway";
import type {
  ProjectDesignRecord,
  ProjectForDesign,
  SaveProjectDesignInput,
  TemplateForDesign,
  TemplateVersionForDesign,
} from "../project-design/project-design-types";

/**
 * Production ProjectDesignGateway (Task 028): the only place in this
 * feature that issues real @supabase/supabase-js calls. Always invoked with
 * a staff-scoped client (Task 004's createStaffSupabaseClient), so
 * `projects`/`templates`/`template_versions`/`project_design` RLS remains
 * the real enforcement — this module never uses an elevated-access
 * (service-role) credential and never
 * calls an RPC (API_CONTRACT.md §8: "project_design get/upsert" is DIRECT
 * RLS, not a trusted business action).
 *
 * Every row this module reads is runtime-validated before being trusted
 * (Task 028 closure §13 — the current hardened Task 025-027 direction, not
 * an unguarded `as unknown as Row` cast). Any shape violation throws a
 * plain, static, non-ApiError Error, which the route layer maps to a
 * generic INTERNAL/500 without ever echoing the malformed row.
 *
 * Type-valid data is not automatically correctly-bound data (Task 028
 * independent review patch 1, Finding D): every read/write below also
 * asserts the returned row's identifying column(s) match the id(s) the
 * query was actually scoped by — a type-correct row bound to the wrong
 * project/template/version is malformed just the same and fails closed.
 */

const PROJECT_DESIGN_COLUMNS =
  "id, project_id, template_version_id, palette_key, font_preset_key, effect_preset_key, " +
  "section_settings, design_settings, created_at, updated_at";

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && isValidUuid(value);
}

function isTimestamptzString(value: unknown): value is string {
  return typeof value === "string" && isValidTimestamptz(value);
}

function isNullableTimestamptzString(value: unknown): value is string | null {
  return value === null || isTimestamptzString(value);
}

/**
 * For a `.maybeSingle()` result, `data === null` is the ONLY legitimate
 * "no matching row" outcome. Any other falsy value (`undefined`, `false`,
 * `0`, `""`) is not PostgREST's documented "no row" signal and must fail
 * closed as an unexpected result shape rather than being treated the same
 * as a real absence (Task 028 independent review patch 2, Finding E) — a
 * bare `if (!data)` check would incorrectly collapse both cases. This guard
 * also rejects an array/non-plain-object value before any field is
 * accessed, so a malformed shape can never produce an incidental
 * `undefined`-property read that happens to look like a validation
 * failure for the wrong reason.
 */
function isRecordShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Hardens a persisted `section_settings`/`design_settings` JSONB value:
 * must be a plain object, own keys only, every value a
 * string/finite-number/boolean (exactly the shape this feature ever
 * persists). Built via `Object.create(null)` (prototype-pollution safety —
 * Task 028 closure §5/§6).
 */
function toSettingsRecord(value: unknown): Record<string, string | number | boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail();
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, string | number | boolean> = Object.create(null) as Record<
    string,
    string | number | boolean
  >;

  for (const key of Object.keys(record)) {
    const entry = record[key];

    if (typeof entry === "string" || typeof entry === "boolean") {
      result[key] = entry;
      continue;
    }

    if (typeof entry === "number" && Number.isFinite(entry)) {
      result[key] = entry;
      continue;
    }

    fail();
  }

  return result;
}

interface ProjectDesignRow {
  id: unknown;
  project_id: unknown;
  template_version_id: unknown;
  palette_key: unknown;
  font_preset_key: unknown;
  effect_preset_key: unknown;
  section_settings: unknown;
  design_settings: unknown;
  created_at: unknown;
  updated_at: unknown;
}

function toProjectDesignRecord(row: ProjectDesignRow): ProjectDesignRecord {
  if (
    !isUuidString(row.id) ||
    !isUuidString(row.project_id) ||
    !isUuidString(row.template_version_id) ||
    !isNonEmptyString(row.palette_key) ||
    !isNonEmptyString(row.font_preset_key) ||
    !isNonEmptyString(row.effect_preset_key) ||
    !isTimestamptzString(row.created_at) ||
    !isTimestamptzString(row.updated_at)
  ) {
    fail();
  }

  return {
    id: row.id,
    projectId: row.project_id,
    templateVersionId: row.template_version_id,
    paletteKey: row.palette_key,
    fontPresetKey: row.font_preset_key,
    effectPresetKey: row.effect_preset_key,
    sectionSettings: toSettingsRecord(row.section_settings),
    designSettings: toSettingsRecord(row.design_settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseProjectDesignGateway: ProjectDesignGateway<SupabaseClient> = {
  async getProjectForDesign(client, projectId: string): Promise<ProjectForDesign | null> {
    const { data, error } = await client
      .from("projects")
      .select("id, event_type")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query project");
    }

    if (data === null) {
      return null;
    }

    if (!isRecordShape(data)) {
      fail();
    }

    const row = data as { id: unknown; event_type: unknown };

    if (!isUuidString(row.id) || !isEventType(row.event_type)) {
      fail();
    }

    // Type-valid but incorrectly-bound data is still malformed data (Task
    // 028 independent review patch 1, Finding D) — a row whose id does not
    // match the queried projectId can never be a legitimate PostgREST
    // result for `.eq("id", projectId)` and must fail closed rather than be
    // silently trusted.
    if (row.id !== projectId) {
      fail();
    }

    return { id: row.id, eventType: row.event_type };
  },

  async getCurrentProjectDesign(
    client,
    projectId: string,
  ): Promise<ProjectDesignRecord | null> {
    const { data, error } = await client
      .from("project_design")
      .select(PROJECT_DESIGN_COLUMNS)
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query project design");
    }

    if (data === null) {
      return null;
    }

    if (!isRecordShape(data)) {
      fail();
    }

    const record = toProjectDesignRecord(data as unknown as ProjectDesignRow);

    if (record.projectId !== projectId) {
      fail();
    }

    return record;
  },

  async getTemplateVersionForDesign(
    client,
    templateVersionId: string,
  ): Promise<TemplateVersionForDesign | null> {
    const { data, error } = await client
      .from("template_versions")
      .select("id, template_id, manifest, retired_at")
      .eq("id", templateVersionId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query template version");
    }

    if (data === null) {
      return null;
    }

    if (!isRecordShape(data)) {
      fail();
    }

    const row = data as {
      id: unknown;
      template_id: unknown;
      manifest: unknown;
      retired_at: unknown;
    };

    if (
      !isUuidString(row.id) ||
      !isUuidString(row.template_id) ||
      !isNullableTimestamptzString(row.retired_at)
    ) {
      fail();
    }

    if (row.id !== templateVersionId) {
      fail();
    }

    return {
      id: row.id,
      templateId: row.template_id,
      manifest: row.manifest,
      retiredAt: row.retired_at,
    };
  },

  async getTemplateForDesign(client, templateId: string): Promise<TemplateForDesign | null> {
    const { data, error } = await client
      .from("templates")
      .select("id, event_type, is_active")
      .eq("id", templateId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query template");
    }

    if (data === null) {
      return null;
    }

    if (!isRecordShape(data)) {
      fail();
    }

    const row = data as { id: unknown; event_type: unknown; is_active: unknown };

    if (!isUuidString(row.id) || !isEventType(row.event_type) || typeof row.is_active !== "boolean") {
      fail();
    }

    if (row.id !== templateId) {
      fail();
    }

    return { id: row.id, eventType: row.event_type, isActive: row.is_active };
  },

  async upsertProjectDesign(
    client,
    projectId: string,
    input: SaveProjectDesignInput,
  ): Promise<ProjectDesignRecord> {
    const { data, error } = await client
      .from("project_design")
      .upsert(
        {
          project_id: projectId,
          template_version_id: input.templateVersionId,
          palette_key: input.paletteKey,
          font_preset_key: input.fontPresetKey,
          effect_preset_key: input.effectPresetKey,
          section_settings: input.sectionSettings,
          design_settings: input.designSettings,
        },
        { onConflict: "project_id" },
      )
      .select(PROJECT_DESIGN_COLUMNS)
      .single();

    if (error) {
      throw new Error("Failed to save project design");
    }

    if (!data) {
      fail();
    }

    const record = toProjectDesignRecord(data as unknown as ProjectDesignRow);

    if (record.projectId !== projectId || record.templateVersionId !== input.templateVersionId) {
      fail();
    }

    return record;
  },
};
