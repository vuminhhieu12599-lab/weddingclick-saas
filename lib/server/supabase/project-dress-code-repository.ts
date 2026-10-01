import type { SupabaseClient } from "@supabase/supabase-js";

import { DRESS_CODE_SWATCH_COLOR_PATTERN } from "../../invitation-rendering/snapshot-payload-types";
import type {
  ProjectDressCodeGateway,
  ProjectDressCodeWithSwatches,
} from "../project-dress-code/project-dress-code-gateway";
import type {
  ProjectDressCodeRecord,
  ProjectDressCodeSwatchRecord,
} from "../project-dress-code/project-dress-code-types";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Production ProjectDressCodeGateway: direct RLS SELECTs on
 * `project_dress_codes` and `project_dress_code_swatches` (migration 0030)
 * with a staff-scoped client only. Values are copied as stored; a swatch
 * colour that is not canonical `#rrggbb` fails loudly instead of ever
 * reaching a renderer as CSS.
 */
const DRESS_CODE_COLUMNS = "project_id, description, created_at, updated_at";
const SWATCH_COLUMNS = "id, project_id, color, sort_order, created_at, updated_at";

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isRecordShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamptzString(value: unknown): value is string {
  return typeof value === "string" && isValidTimestamptz(value);
}

function toDressCodeRecord(value: unknown, projectId: string): ProjectDressCodeRecord {
  if (!isRecordShape(value)) fail();
  const { project_id, description, created_at, updated_at } = value;

  if (
    project_id !== projectId ||
    (description !== null && typeof description !== "string") ||
    !isTimestamptzString(created_at) ||
    !isTimestamptzString(updated_at)
  ) {
    fail();
  }

  return { projectId, description, createdAt: created_at, updatedAt: updated_at };
}

function toSwatchRecord(value: unknown, projectId: string): ProjectDressCodeSwatchRecord {
  if (!isRecordShape(value)) fail();
  const { id, project_id, color, sort_order, created_at, updated_at } = value;

  if (
    typeof id !== "string" ||
    !isValidUuid(id) ||
    project_id !== projectId ||
    typeof color !== "string" ||
    !DRESS_CODE_SWATCH_COLOR_PATTERN.test(color) ||
    typeof sort_order !== "number" ||
    !Number.isInteger(sort_order) ||
    !isTimestamptzString(created_at) ||
    !isTimestamptzString(updated_at)
  ) {
    fail();
  }

  return { id, projectId, color, sortOrder: sort_order, createdAt: created_at, updatedAt: updated_at };
}

export const supabaseProjectDressCodeGateway: ProjectDressCodeGateway<SupabaseClient> = {
  async getProjectDressCode(client, projectId): Promise<ProjectDressCodeWithSwatches | null> {
    const { data, error } = await client
      .from("project_dress_codes")
      .select(DRESS_CODE_COLUMNS)
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query project dress code");
    }
    if (data === null) {
      // Swatches cannot exist without this row (0030 FK), so there is nothing else to read.
      return null;
    }
    const dressCode = toDressCodeRecord(data, projectId);

    const swatchResult = await client
      .from("project_dress_code_swatches")
      .select(SWATCH_COLUMNS)
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (swatchResult.error) {
      throw new Error("Failed to query project dress code swatches");
    }
    if (!Array.isArray(swatchResult.data)) fail();

    return {
      dressCode,
      swatches: swatchResult.data.map((row: unknown) => toSwatchRecord(row, projectId)),
    };
  },
};
