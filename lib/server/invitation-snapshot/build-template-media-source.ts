import { isTemplateSlotAssignableMediaType } from "../../domain";
import type { SnapshotMediaSource, SnapshotTemplateMediaSource } from "../../invitation-rendering/snapshot-payload-types";
import type { TemplateEditorManifestV1 } from "../../../templates/core/editor-manifest";
import type { TemplateMediaSlotItem } from "../template-media/template-media-slot-types";

/**
 * Thrown when the draft slot rows of the exact template version cannot be
 * frozen into a Snapshot (TE-04). Fixed, generic messages; never repaired,
 * truncated or substituted.
 */
export class SnapshotTemplateMediaInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotTemplateMediaInvariantError";
  }
}

function fail(message: string): never {
  throw new SnapshotTemplateMediaInvariantError(message);
}

/**
 * TE-04 — builds the trusted `SnapshotTemplateMediaSource` of a
 * `TEMPLATE_SLOTS` renderer from the draft rows of the Project's CURRENT
 * exact template version, validated against that version's
 * TemplateEditorManifestV1 and the already-loaded Project media inventory:
 *
 * 1. no slot key the manifest does not declare;
 * 2. every declared slot present (empty → `[]`);
 * 3. positions contiguous 0..N-1, order preserved;
 * 4. SINGLE ≤ 1; 5. finite maxCount enforced;
 * 6. no duplicate media inside one slot (across slots is allowed);
 * 7. every id exists in the Project media inventory and is CURRENTLY a
 *    slot-assignable photo type (re-checked even though the RPC checked it).
 *
 * `gallerySlotKeys` comes from the manifest `sectionKey === "gallery"`,
 * never from a slot name.
 */
export function buildTemplateMediaSource(
  manifest: TemplateEditorManifestV1,
  rows: readonly TemplateMediaSlotItem[],
  media: readonly SnapshotMediaSource[],
): SnapshotTemplateMediaSource {
  if (manifest.mediaModel !== "TEMPLATE_SLOTS") {
    fail("Template media source requires a TEMPLATE_SLOTS editor manifest");
  }
  const declared = new Map(manifest.mediaSlots.map((slot) => [slot.key, slot]));
  const byKey = new Map<string, TemplateMediaSlotItem[]>();
  for (const row of rows) {
    if (!declared.has(row.slotKey)) {
      fail("Template media slot is not declared by the pinned template version");
    }
    const list = byKey.get(row.slotKey) ?? [];
    list.push(row);
    byKey.set(row.slotKey, list);
  }

  const mediaTypeById = new Map(media.map((item) => [item.id, item.mediaType]));
  const slots: Record<string, string[]> = {};
  for (const slot of manifest.mediaSlots) {
    const items = [...(byKey.get(slot.key) ?? [])].sort((a, b) => a.position - b.position);
    items.forEach((item, index) => {
      if (item.position !== index) fail("Template media slot positions are not contiguous");
    });
    const ids = items.map((item) => item.projectMediaId);
    if (slot.cardinality === "SINGLE" && ids.length > 1) {
      fail("Template media slot exceeds its cardinality");
    }
    if (slot.maxCount !== null && ids.length > slot.maxCount) {
      fail("Template media slot exceeds its maximum count");
    }
    if (new Set(ids).size !== ids.length) {
      fail("Template media slot contains duplicate media");
    }
    for (const id of ids) {
      if (!mediaTypeById.has(id)) fail("Template media slot references media missing from the Project");
      if (!isTemplateSlotAssignableMediaType(mediaTypeById.get(id))) {
        fail("Template media slot references media that is not an assignable photo");
      }
    }
    slots[slot.key] = ids;
  }

  return {
    slots,
    gallerySlotKeys: manifest.mediaSlots.filter((slot) => slot.sectionKey === "gallery").map((slot) => slot.key),
  };
}
