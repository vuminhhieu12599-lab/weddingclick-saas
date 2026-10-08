import { describe, expect, it } from "vitest";

import { lookupTemplateEditorManifest } from "../../../templates/core/production-editor-manifests";
import type { TemplateEditorManifestV1, TemplateEditorMediaSlotV1 } from "../../../templates/core/editor-manifest";
import { MEDIA_EDITOR_ROLES } from "../optional-content-editor";
import { contentEditorsFor, findCatalogVersion, legacyMediaRolesFor } from "../template-editor-presentation";
import {
  applyPick,
  assignmentsBySlot,
  isSelectableForSlot,
  moveAt,
  PHOTO_SOURCE_LABELS,
  photoUploadSortOrders,
  pickerCapacity,
  removeAt,
  slotCountLabel,
  slotMaximum,
  TEMPLATE_SLOT_HARD_MAX_ITEMS,
} from "../template-slot-editor";

/** TE-05A — pure Staff slot editing and manifest-driven presentation. */

const EE = lookupTemplateEditorManifest("wedding.elegant-editorial.v1")!;
const VH = lookupTemplateEditorManifest("wedding.vietnamese-heritage.v1")!;
const slot = (key: string): TemplateEditorMediaSlotV1 => VH.mediaSlots.find((entry) => entry.key === key)!;

describe("slot editing rules (manifest-driven)", () => {
  it("SINGLE replaces the current photo", () => {
    expect(applyPick(slot("heroPhoto"), ["a"], ["b"])).toEqual(["b"]);
    expect(applyPick(slot("heroPhoto"), [], ["b", "c"])).toEqual(["b"]);
    expect(pickerCapacity(slot("heroPhoto"), ["a"])).toBe(1);
  });

  it("ORDERED_MULTI appends in pick order and respects the manifest maximum", () => {
    expect(applyPick(slot("portraitCluster"), ["a"], ["c", "b"])).toEqual(["a", "c", "b"]);
    expect(applyPick(slot("portraitCluster"), ["a", "b"], ["c", "d"])).toBeNull();
    expect(pickerCapacity(slot("portraitCluster"), ["a", "b"])).toBe(1);
    expect(pickerCapacity(slot("portraitCluster"), ["a", "b", "c"])).toBe(0);
  });

  it("the maximum comes from the manifest, not the slot key", () => {
    const renamed: TemplateEditorMediaSlotV1 = { ...slot("portraitCluster"), key: "anyOtherName", maxCount: 5 };
    expect(slotMaximum(renamed)).toBe(5);
    expect(applyPick(renamed, ["a", "b", "c"], ["d"])).toEqual(["a", "b", "c", "d"]);
  });

  it("an unbounded gallery keeps only the RPC hard ceiling", () => {
    expect(slotMaximum(slot("gallery"))).toBe(TEMPLATE_SLOT_HARD_MAX_ITEMS);
    expect(applyPick(slot("gallery"), ["a", "b", "c"], ["d", "e"])).toHaveLength(5);
  });

  it("prevents duplicates inside one slot but allows the same photo in another slot", () => {
    expect(isSelectableForSlot(["a"], "a")).toBe(false);
    expect(applyPick(slot("gallery"), ["a"], ["a", "b", "b"])).toEqual(["a", "b"]);
    expect(isSelectableForSlot(["x"], "a")).toBe(true);
  });

  it("reorders and removes by position", () => {
    expect(moveAt(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveAt(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(removeAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("groups slot rows by key in position order", () => {
    expect(assignmentsBySlot([
      { slotKey: "gallery", position: 1, projectMediaId: "b" },
      { slotKey: "heroPhoto", position: 0, projectMediaId: "h" },
      { slotKey: "gallery", position: 0, projectMediaId: "a" },
    ])).toEqual({ gallery: ["a", "b"], heroPhoto: ["h"] });
  });

  it("count labels and library sort orders are deterministic", () => {
    expect(slotCountLabel(slot("portraitCluster"), 2)).toBe("2/3");
    expect(slotCountLabel(slot("heroPhoto"), 0)).toBe("0/1");
    expect(slotCountLabel(slot("gallery"), 7)).toBe("7 ảnh");
    expect(photoUploadSortOrders(4, 3)).toEqual([4, 5, 6]);
  });

  it("labels every legacy photograph type as selectable library photos", () => {
    expect(Object.keys(PHOTO_SOURCE_LABELS).sort()).toEqual(["COVER", "GALLERY", "LOVE_STORY_PHOTO", "PHOTO", "PHOTO_STORY", "PORTRAIT_BRIDE", "PORTRAIT_GROOM"]);
  });
});

describe("media model presentation", () => {
  it("LEGACY_ROLES keeps every legacy media role unchanged", () => {
    expect(legacyMediaRolesFor(EE)).toBe(MEDIA_EDITOR_ROLES);
  });

  it("TEMPLATE_SLOTS shows no layout role: only AUDIO (with MUSIC) and SOCIAL_SHARE_COVER", () => {
    expect(legacyMediaRolesFor(VH).map((role) => role.mediaType)).toEqual(["AUDIO", "SOCIAL_SHARE_COVER"]);
    const withoutMusic: TemplateEditorManifestV1 = { ...VH, contentItems: VH.contentItems.filter((item) => item.key !== "MUSIC") };
    expect(legacyMediaRolesFor(withoutMusic).map((role) => role.mediaType)).toEqual(["SOCIAL_SHARE_COVER"]);
    for (const role of legacyMediaRolesFor(VH)) expect(role.mediaType).not.toMatch(/^QR_/);
  });

  it("content editors follow manifest content items", () => {
    expect(contentEditorsFor(VH)).toEqual({ families: true, timeline: true, dressCode: true, loveStory: true, gift: true });
    const minimal: TemplateEditorManifestV1 = { ...VH, contentItems: VH.contentItems.filter((item) => ["COUPLE", "EVENTS", "GIFT"].includes(item.key)) };
    expect(contentEditorsFor(minimal)).toEqual({ families: false, timeline: false, dressCode: false, loveStory: false, gift: true });
  });

  it("finds the exact pinned catalog version only", () => {
    const catalog = [{ versions: [{ id: "v1" }, { id: "v2" }] }] as never;
    expect(findCatalogVersion(catalog, "v2")?.version.id).toBe("v2");
    expect(findCatalogVersion(catalog, "v3")).toBeNull();
  });
});
