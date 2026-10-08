import type { TemplateSlotAssignableMediaType } from "../domain";
import type { TemplateEditorMediaSlotV1 } from "../../templates/core/editor-manifest";
import type { TemplateMediaSlotItem } from "../server/template-media/template-media-slot-types";

/**
 * TE-05A — pure Staff slot-editing logic, driven only by the selected
 * template version's TemplateEditorManifestV1 slot definitions. No slot key
 * is special-cased here. The server stays authoritative (it re-derives the
 * slot contract from the DB-pinned renderer); these rules only keep the UI
 * honest and avoid pointless rejected writes.
 */

/** Structural per-slot ceiling of the write RPC (migration 0046), used when the manifest has no maxCount. */
export const TEMPLATE_SLOT_HARD_MAX_ITEMS = 500;

/** Assigned media ids per slot key, in position order. */
export function assignmentsBySlot(items: readonly TemplateMediaSlotItem[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    (result[item.slotKey] ??= []).push(item.projectMediaId);
  }
  return result;
}

/** The effective maximum: SINGLE → 1, finite manifest max, else the RPC hard ceiling. */
export function slotMaximum(slot: Pick<TemplateEditorMediaSlotV1, "cardinality" | "maxCount">): number {
  if (slot.cardinality === "SINGLE") return 1;
  return slot.maxCount ?? TEMPLATE_SLOT_HARD_MAX_ITEMS;
}

/**
 * How many more photos the picker may add. SINGLE always allows choosing
 * one (it replaces the current photo); ORDERED_MULTI allows up to the
 * remaining capacity.
 */
export function pickerCapacity(slot: Pick<TemplateEditorMediaSlotV1, "cardinality" | "maxCount">, current: readonly string[]): number {
  if (slot.cardinality === "SINGLE") return 1;
  return Math.max(0, slotMaximum(slot) - current.length);
}

/** A photo already in this slot cannot be chosen again for the same slot (other slots are fine). */
export function isSelectableForSlot(current: readonly string[], mediaId: string): boolean {
  return !current.includes(mediaId);
}

/**
 * The next ordered list after a pick: SINGLE replaces; ORDERED_MULTI appends
 * in pick order, skipping ids already present. Returns `null` when the result
 * would exceed the slot maximum (the caller shows a message; nothing is sent).
 */
export function applyPick(
  slot: Pick<TemplateEditorMediaSlotV1, "cardinality" | "maxCount">,
  current: readonly string[],
  picked: readonly string[],
): string[] | null {
  const fresh = picked.filter((id, index) => !current.includes(id) && picked.indexOf(id) === index);
  if (slot.cardinality === "SINGLE") {
    return fresh.length === 0 ? [...current] : [fresh[0] as string];
  }
  const next = [...current, ...fresh];
  return next.length > slotMaximum(slot) ? null : next;
}

export function removeAt(current: readonly string[], index: number): string[] {
  return current.filter((_, position) => position !== index);
}

/** Moves one position by `delta`; unchanged when out of range. */
export function moveAt(current: readonly string[], index: number, delta: -1 | 1): string[] {
  const target = index + delta;
  if (index < 0 || index >= current.length || target < 0 || target >= current.length) return [...current];
  const next = [...current];
  [next[index], next[target]] = [next[target] as string, next[index] as string];
  return next;
}

/** Staff-facing count text: "2/3" for a finite target, else "2". */
export function slotCountLabel(slot: Pick<TemplateEditorMediaSlotV1, "cardinality" | "maxCount" | "recommendedCount">, count: number): string {
  const target = slot.cardinality === "SINGLE" ? 1 : (slot.maxCount ?? (slot.recommendedCount > 0 ? slot.recommendedCount : null));
  return target === null ? `${count} ảnh` : `${count}/${target}`;
}

/** Library sort orders for newly uploaded PHOTO rows: consecutive after the existing PHOTO count. Library convenience only. */
export function photoUploadSortOrders(existingPhotoCount: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => existingPhotoCount + index);
}

export const PHOTO_SOURCE_LABELS: Readonly<Record<TemplateSlotAssignableMediaType, string>> = Object.freeze({
  PHOTO: "Ảnh thư viện",
  COVER: "Ảnh bìa (cũ)",
  GALLERY: "Album (cũ)",
  PORTRAIT_GROOM: "Chân dung chú rể (cũ)",
  PORTRAIT_BRIDE: "Chân dung cô dâu (cũ)",
  PHOTO_STORY: "Photo Story (cũ)",
  LOVE_STORY_PHOTO: "Ảnh chuyện tình (cũ)",
});
