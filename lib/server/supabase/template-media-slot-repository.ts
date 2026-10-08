import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../errors/api-error";
import { TEMPLATE_MEDIA_SLOT_RPC_ERROR_CODES } from "../template-media/template-media-slot-rpc-error-codes";
import type { TemplateMediaSlotGateway } from "../template-media/template-media-slot-gateway";
import {
  TEMPLATE_MEDIA_SLOT_KEY_PATTERN,
  type ReplaceTemplateMediaSlotCommand,
  type TemplateMediaSlotItem,
} from "../template-media/template-media-slot-types";
import { isValidUuid } from "../validation/uuid";

/**
 * Production TemplateMediaSlotGateway (TE-03B, migration 0046). Always
 * invoked with a staff-scoped client; never the elevated credential.
 *
 * - Read: one direct RLS SELECT (`is_staff()`) of exactly
 *   (slot_key, position, project_media_id), scoped by the exact Project and
 *   template version.
 * - Write: only the trusted `set_project_template_media_slot` RPC; there is
 *   no table write anywhere (the table grants none).
 *
 * Every row is shape-checked and the slot lists must be contiguous 0..N-1
 * with no duplicate media per slot; anything else is an unexpected database
 * shape and fails with a static generic error (never the raw payload).
 */
const UNEXPECTED_SHAPE = "Unexpected template media slot result shape";

function fail(): never {
  throw new Error(UNEXPECTED_SHAPE);
}

function toItem(row: unknown): TemplateMediaSlotItem {
  if (typeof row !== "object" || row === null || Array.isArray(row)) fail();
  const { slot_key, position, project_media_id } = row as Record<string, unknown>;
  if (
    typeof slot_key !== "string" ||
    !TEMPLATE_MEDIA_SLOT_KEY_PATTERN.test(slot_key) ||
    typeof position !== "number" ||
    !Number.isSafeInteger(position) ||
    position < 0 ||
    typeof project_media_id !== "string" ||
    !isValidUuid(project_media_id)
  ) {
    fail();
  }
  return { slotKey: slot_key, position, projectMediaId: project_media_id };
}

function compareItems(a: TemplateMediaSlotItem, b: TemplateMediaSlotItem): number {
  if (a.slotKey !== b.slotKey) return a.slotKey < b.slotKey ? -1 : 1;
  return a.position - b.position;
}

/** Sorted by slotKey then position; each slot contiguous 0..N-1 and duplicate-free. */
function toOrderedItems(data: unknown): TemplateMediaSlotItem[] {
  if (!Array.isArray(data)) fail();
  const items = data.map(toItem).sort(compareItems);
  const expectedPosition = new Map<string, number>();
  const mediaBySlot = new Map<string, Set<string>>();
  for (const item of items) {
    const expected = expectedPosition.get(item.slotKey) ?? 0;
    if (item.position !== expected) fail();
    expectedPosition.set(item.slotKey, expected + 1);
    const media = mediaBySlot.get(item.slotKey) ?? new Set<string>();
    if (media.has(item.projectMediaId)) fail();
    media.add(item.projectMediaId);
    mediaBySlot.set(item.slotKey, media);
  }
  return items;
}

export const supabaseTemplateMediaSlotGateway: TemplateMediaSlotGateway<SupabaseClient> = {
  async listSlotItems(client, projectId, templateVersionId) {
    const { data, error } = await client
      .from("project_template_media_slot_items")
      .select("slot_key, position, project_media_id")
      .eq("project_id", projectId)
      .eq("template_version_id", templateVersionId)
      .order("slot_key", { ascending: true })
      .order("position", { ascending: true });

    if (error) {
      throw new Error("Failed to query template media slots");
    }
    return toOrderedItems(data);
  },

  async replaceSlot(client, command: ReplaceTemplateMediaSlotCommand) {
    const { data, error } = await client.rpc("set_project_template_media_slot", {
      p_project_id: command.projectId,
      p_template_version_id: command.templateVersionId,
      p_slot_key: command.slotKey,
      p_project_media_ids: [...command.projectMediaIds],
    });

    if (error) {
      const known = TEMPLATE_MEDIA_SLOT_RPC_ERROR_CODES[error.code];
      if (known) {
        throw new ApiError(known.kind, known.message);
      }
      throw new Error("Failed to replace template media slot");
    }

    const items = toOrderedItems(data);
    // The RPC returns exactly the replaced slot, in the submitted order.
    if (items.length !== command.projectMediaIds.length) fail();
    items.forEach((item, index) => {
      if (item.slotKey !== command.slotKey || item.projectMediaId.toLowerCase() !== command.projectMediaIds[index]?.toLowerCase()) fail();
    });
    return items;
  },
};
