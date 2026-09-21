import type { SupabaseClient } from "@supabase/supabase-js";

import { EVENT_TYPES, type EventType } from "../../domain";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";
import type { TemplatesGateway } from "../templates/templates-gateway";
import type { RawTemplateCatalogRow, RawTemplateVersionRow } from "../templates/templates-types";

/**
 * Production TemplatesGateway (Task 028): the only place in this feature
 * that issues real @supabase/supabase-js calls. Always invoked with a
 * staff-scoped client, so `templates`/`template_versions` RLS
 * (`is_staff()`) remains the real enforcement — DIRECT RLS SELECT only, no
 * elevated-access (service-role) credential, no RPC.
 *
 * Issues two flat queries (templates, template_versions) rather than one
 * PostgREST embedded/nested select — this keeps ordering fully explicit
 * and independently verifiable/testable rather than depending on
 * `{ foreignTable: ... }` embedded-resource ordering behavior with no
 * existing precedent elsewhere in this repository.
 */

const TEMPLATE_COLUMNS =
  "id, code, event_type, name, description, is_active, sort_order, preview_media_path";

const TEMPLATE_VERSION_COLUMNS = "id, template_id, version_number, renderer_key, manifest, retired_at";

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

function isUuidString(value: unknown): value is string {
  return typeof value === "string" && isValidUuid(value);
}

function isNullableTimestamptzString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isValidTimestamptz(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

interface TemplateRow {
  id: unknown;
  code: unknown;
  event_type: unknown;
  name: unknown;
  description: unknown;
  is_active: unknown;
  sort_order: unknown;
  preview_media_path: unknown;
}

interface TemplateVersionRow {
  id: unknown;
  template_id: unknown;
  version_number: unknown;
  renderer_key: unknown;
  manifest: unknown;
  retired_at: unknown;
}

function toTemplateRow(row: TemplateRow): Omit<RawTemplateCatalogRow, "versions"> {
  if (
    !isUuidString(row.id) ||
    !isNonEmptyString(row.code) ||
    !isEventType(row.event_type) ||
    !isNonEmptyString(row.name) ||
    (row.description !== null && typeof row.description !== "string") ||
    typeof row.is_active !== "boolean" ||
    typeof row.sort_order !== "number" ||
    !Number.isInteger(row.sort_order) ||
    (row.preview_media_path !== null && typeof row.preview_media_path !== "string")
  ) {
    fail();
  }

  return {
    id: row.id,
    code: row.code,
    eventType: row.event_type,
    name: row.name,
    description: row.description as string | null,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    previewMediaPath: row.preview_media_path as string | null,
  };
}

function toTemplateVersionRow(row: TemplateVersionRow): RawTemplateVersionRow & {
  templateId: string;
} {
  if (
    !isUuidString(row.id) ||
    !isUuidString(row.template_id) ||
    typeof row.version_number !== "number" ||
    !Number.isInteger(row.version_number) ||
    row.version_number <= 0 ||
    !isNonEmptyString(row.renderer_key) ||
    !isNullableTimestamptzString(row.retired_at)
  ) {
    fail();
  }

  return {
    id: row.id,
    templateId: row.template_id,
    versionNumber: row.version_number,
    rendererKey: row.renderer_key,
    manifest: row.manifest,
    retiredAt: row.retired_at,
  };
}

export const supabaseTemplatesGateway: TemplatesGateway<SupabaseClient> = {
  async listTemplatesWithVersions(client): Promise<RawTemplateCatalogRow[]> {
    const { data: templateData, error: templateError } = await client
      .from("templates")
      .select(TEMPLATE_COLUMNS)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (templateError) {
      throw new Error("Failed to query templates");
    }

    const { data: versionData, error: versionError } = await client
      .from("template_versions")
      .select(TEMPLATE_VERSION_COLUMNS)
      .order("version_number", { ascending: true })
      .order("id", { ascending: true });

    if (versionError) {
      throw new Error("Failed to query template versions");
    }

    // A non-array result is itself an unexpected shape — never rely on the
    // TypeError a subsequent .map() call on non-array data would happen to
    // throw as implicit validation (Task 028 independent review patch 1,
    // Finding 5C).
    if (!Array.isArray(templateData) || !Array.isArray(versionData)) {
      fail();
    }

    const templateRows = (templateData as unknown as TemplateRow[]).map(toTemplateRow);
    const versionRows = (versionData as unknown as TemplateVersionRow[]).map(
      toTemplateVersionRow,
    );

    // Every template-version row's parent must be among the returned
    // template rows. Under the template_versions.template_id -> templates
    // FK this is structurally unreachable in a consistent result — if it
    // happens anyway, it is malformed/inconsistent DB result data and must
    // fail closed rather than silently drop the orphan row from the catalog
    // (Task 028 independent review patch 1, Finding 5D).
    const templateIds = new Set(templateRows.map((template) => template.id));
    for (const version of versionRows) {
      if (!templateIds.has(version.templateId)) {
        fail();
      }
    }

    return templateRows.map((template) => ({
      ...template,
      versions: versionRows
        .filter((version) => version.templateId === template.id)
        .map(
          (version): RawTemplateVersionRow => ({
            id: version.id,
            versionNumber: version.versionNumber,
            rendererKey: version.rendererKey,
            manifest: version.manifest,
            retiredAt: version.retiredAt,
          }),
        ),
    }));
  },
};
