import type { TemplateEditorManifestV1 } from "../../../templates/core/editor-manifest";
import { isValidUuid } from "../validation/uuid";

/** One fixed message for every stored template-slot fault (docs/SECURITY.md). */
export const STORED_TEMPLATE_SLOTS_INVALID = "Stored Snapshot template media slots are invalid";

function fail(): never {
  throw new Error(STORED_TEMPLATE_SLOTS_INVALID);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** Legacy layout references a TEMPLATE_SLOTS Snapshot must never carry (TE-04). */
const FORBIDDEN_LEGACY_LAYOUT_KEYS = ["coverMediaId", "portrait", "photoStoryMediaIds", "loveStoryPhotoMediaId"] as const;

/**
 * TE-04 — fail-closed structural validation of a persisted (immutable)
 * Snapshot's media model against the pinned renderer's
 * TemplateEditorManifestV1. Never sanitizes and never falls back to draft
 * data.
 *
 * - `LEGACY_ROLES`: `media.templateSlots` must be absent (every historical
 *   Elegant Editorial payload is accepted unchanged).
 * - `TEMPLATE_SLOTS`: `media.templateSlots` is a plain object with exactly
 *   the declared slot keys; each value an array of unique valid UUIDs
 *   within the slot, obeying SINGLE / finite maxCount (`[]` allowed; an id
 *   may repeat across slots); no legacy layout reference; `galleryMediaIds`
 *   is `[]`; `sections.gallery` equals "a gallery-linked slot is non-empty".
 */
export function assertStoredTemplateSlots(payload: Record<string, unknown>, manifest: TemplateEditorManifestV1): void {
  const media = payload.media;
  if (!isPlainRecord(media)) fail();

  if (manifest.mediaModel === "LEGACY_ROLES") {
    if (hasOwn(media, "templateSlots")) fail();
    return;
  }

  const slots = media.templateSlots;
  if (!isPlainRecord(slots)) fail();
  const declared = manifest.mediaSlots.map((slot) => slot.key);
  const keys = Object.keys(slots);
  if (keys.length !== declared.length || !declared.every((key) => hasOwn(slots, key))) fail();

  for (const slot of manifest.mediaSlots) {
    const ids = slots[slot.key];
    if (!Array.isArray(ids)) fail();
    for (const id of ids as unknown[]) {
      if (typeof id !== "string" || !isValidUuid(id)) fail();
    }
    if (new Set(ids).size !== ids.length) fail();
    if (slot.cardinality === "SINGLE" && ids.length > 1) fail();
    if (slot.maxCount !== null && ids.length > slot.maxCount) fail();
  }

  for (const key of FORBIDDEN_LEGACY_LAYOUT_KEYS) {
    if (hasOwn(media, key)) fail();
  }
  if (!Array.isArray(media.galleryMediaIds) || media.galleryMediaIds.length !== 0) fail();

  const sections = payload.sections;
  if (!isPlainRecord(sections)) fail();
  const galleryAvailable = manifest.mediaSlots.some(
    (slot) => slot.sectionKey === "gallery" && (slots[slot.key] as unknown[]).length > 0,
  );
  if (sections.gallery !== galleryAvailable) fail();
}
