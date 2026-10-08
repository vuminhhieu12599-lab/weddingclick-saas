import { describe, expect, it } from "vitest";

import type { MediaType } from "../../domain";
import type { ProjectMediaRecord } from "../../server/media/media-types";
import type { WeddingDetailsRecord } from "../../server/wedding-details/wedding-details-types";
import {
  buildWeddingDetailsPatchBody,
  effectiveMediaOfRole,
  giftContentFormFrom,
  MEDIA_EDITOR_ROLES,
  mediaOfRole,
  moveItem,
  nextSortOrder,
  parseDressCodeDescription,
  parseSwatchColor,
  parseTimelineForm,
  reorderPlan,
  sortOrderForReplacement,
  sortOrdersForAppend,
  validateMediaFile,
} from "../optional-content-editor";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function media(id: string, mediaType: MediaType, sortOrder: number): ProjectMediaRecord {
  return {
    id,
    projectId: PROJECT_ID,
    mediaType,
    storageBucket: "project-media",
    storagePath: `projects/${PROJECT_ID}/${id}`,
    mimeType: "image/webp",
    sizeBytes: 1000,
    width: null,
    height: null,
    altText: null,
    sortOrder,
    createdBy: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
}

const ROWS: ProjectMediaRecord[] = [
  media("c2", "COVER", 0),
  media("c1", "COVER", 0),
  media("g1", "GALLERY", 0),
  media("p1", "PHOTO_STORY", 3),
  media("p0", "PHOTO_STORY", 1),
  media("pg", "PORTRAIT_GROOM", 0),
  media("q1", "QR_GROOM", -5),
];

describe("media roles", () => {
  it("exposes exactly the Snapshot media roles; QR roles are never role-selected", () => {
    expect(MEDIA_EDITOR_ROLES.map((role) => role.mediaType)).toEqual([
      "COVER",
      "PORTRAIT_GROOM",
      "PORTRAIT_BRIDE",
      "PHOTO_STORY",
      "LOVE_STORY_PHOTO",
      "GALLERY",
      "AUDIO",
      "SOCIAL_SHARE_COVER",
    ]);
  });

  it("PHOTO_STORY and GALLERY are MULTI; every other role is SINGLE", () => {
    const multi = MEDIA_EDITOR_ROLES.filter((role) => role.cardinality === "MULTI").map((role) => role.mediaType);
    expect(multi).toEqual(["PHOTO_STORY", "GALLERY"]);
  });

  it("mediaOfRole never mixes roles and orders sortOrder → id", () => {
    expect(mediaOfRole(ROWS, "PHOTO_STORY").map((row) => row.id)).toEqual(["p0", "p1"]);
    expect(mediaOfRole(ROWS, "GALLERY").map((row) => row.id)).toEqual(["g1"]);
    expect(mediaOfRole(ROWS, "COVER").map((row) => row.id)).toEqual(["c1", "c2"]);
  });

  it("effective SINGLE item uses sort_order then id; no substitution from other roles", () => {
    expect(effectiveMediaOfRole(ROWS, "COVER")?.id).toBe("c1");
    expect(effectiveMediaOfRole(ROWS, "PORTRAIT_BRIDE")).toBeNull();
    expect(effectiveMediaOfRole(ROWS, "LOVE_STORY_PHOTO")).toBeNull();
    expect(effectiveMediaOfRole(ROWS, "AUDIO")).toBeNull();
  });

  it("replacement is ordered before every existing row of that role only", () => {
    expect(sortOrderForReplacement(ROWS, "COVER")).toBe(-1);
    expect(sortOrderForReplacement(ROWS, "PORTRAIT_BRIDE")).toBe(0);
    // QR_GROOM at -5 does not influence PORTRAIT_GROOM.
    expect(sortOrderForReplacement(ROWS, "PORTRAIT_GROOM")).toBe(-1);
  });

  it("append continues after the role's last row with no cap (GALLERY arbitrary count)", () => {
    expect(sortOrdersForAppend(ROWS, "PHOTO_STORY", 2)).toEqual([4, 5]);
    expect(sortOrdersForAppend([], "GALLERY", 3)).toEqual([0, 1, 2]);
    const many = sortOrdersForAppend(ROWS, "GALLERY", 37);
    expect(many).toHaveLength(37);
    expect(many[36]).toBe(37);
  });

  it("validates files against the existing frozen MIME/size policy", () => {
    expect(validateMediaFile("GALLERY", { type: "image/webp", size: 1024 })).toBeNull();
    expect(validateMediaFile("GALLERY", { type: "image/gif", size: 1024 })).toMatch(/Định dạng/);
    expect(validateMediaFile("COVER", { type: "image/jpeg", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(validateMediaFile("AUDIO", { type: "audio/mpeg", size: 15 * 1024 * 1024 })).toBeNull();
    expect(validateMediaFile("AUDIO", { type: "image/png", size: 10 })).toMatch(/Định dạng/);
  });
});

describe("ordering", () => {
  it("moveItem swaps neighbours and ignores out-of-range moves", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
  });

  it("reorderPlan writes only the rows whose position changed", () => {
    expect(reorderPlan([{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 2 }, { id: "c", sortOrder: 2 }])).toEqual([
      { id: "b", sortOrder: 1 },
    ]);
    expect(reorderPlan([{ id: "x", sortOrder: 5 }, { id: "y", sortOrder: 5 }])).toEqual([
      { id: "x", sortOrder: 0 },
      { id: "y", sortOrder: 1 },
    ]);
  });

  it("nextSortOrder follows the max and starts at 0", () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([{ sortOrder: 4 }, { sortOrder: 1 }])).toBe(5);
  });
});

describe("timeline form", () => {
  it("accepts HH:mm and trims the label", () => {
    expect(parseTimelineForm({ time: "08:30", label: "  Đón khách " })).toEqual({
      ok: true,
      value: { time: "08:30", label: "Đón khách" },
    });
  });

  it.each(["8:30", "24:00", "08:30:00", ""])("rejects time %j", (time) => {
    expect(parseTimelineForm({ time, label: "Đón khách" }).ok).toBe(false);
  });

  it("rejects blank or over-long labels", () => {
    expect(parseTimelineForm({ time: "09:00", label: "   " }).ok).toBe(false);
    expect(parseTimelineForm({ time: "09:00", label: "x".repeat(201) }).ok).toBe(false);
  });
});

describe("dress code form", () => {
  it("normalizes explicit entry to lowercase #rrggbb", () => {
    expect(parseSwatchColor(" #A1B2C3 ")).toEqual({ ok: true, value: "#a1b2c3" });
  });

  it.each(["", "#fff", "red", "a1b2c3", "#a1b2c3ff", "rgb(1,2,3)", "url(x)"])("rejects %j", (raw) => {
    expect(parseSwatchColor(raw).ok).toBe(false);
  });

  it("blank description clears to null; no default text", () => {
    expect(parseDressCodeDescription("   ")).toEqual({ ok: true, value: null });
    expect(parseDressCodeDescription(" Tông pastel ")).toEqual({ ok: true, value: "Tông pastel" });
    expect(parseDressCodeDescription("x".repeat(1001)).ok).toBe(false);
  });
});

describe("gift / love story wedding_details body", () => {
  const current = {
    id: "w1",
    projectId: PROJECT_ID,
    groomName: "Minh",
    brideName: "Lan",
    groomFather: "Ông A",
    groomMother: null,
    brideFather: null,
    brideMother: "Bà B",
    groomFamilyAddress: null,
    brideFamilyAddress: null,
    invitationMessage: "Lời mời",
    loveStory: null,
    lunarDateDisplay: null,
    additionalNote: "ghi chú nội bộ",
    groomBankName: "VCB",
    groomBankAccountName: null,
    groomBankAccountNumber: null,
    groomBankQrMediaId: "22222222-2222-4222-8222-222222222222",
    brideBankName: null,
    brideBankAccountName: null,
    brideBankAccountNumber: null,
    brideBankQrMediaId: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  } as WeddingDetailsRecord;

  it("requires saved wedding details", () => {
    expect(buildWeddingDetailsPatchBody(null, { form: giftContentFormFrom(null) }).ok).toBe(false);
  });

  it("re-sends every other field unchanged and applies only the form fields (blank → null)", () => {
    const form = { ...giftContentFormFrom(current), loveStory: " Chuyện " , groomBankName: "  " };
    const result = buildWeddingDetailsPatchBody(current, { form });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.loveStory).toBe("Chuyện");
    expect(result.value.groomBankName).toBeNull();
    expect(result.value.groomFather).toBe("Ông A");
    expect(result.value.additionalNote).toBe("ghi chú nội bộ");
    expect(result.value.groomBankQrMediaId).toBe(current.groomBankQrMediaId);
  });

  it("a QR patch changes only its own side — never copies one side's QR to the other", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const result = buildWeddingDetailsPatchBody(current, { qr: { brideBankQrMediaId: id } });
    expect(result.ok && result.value.brideBankQrMediaId).toBe(id);
    expect(result.ok && result.value.groomBankQrMediaId).toBe(current.groomBankQrMediaId);
    const cleared = buildWeddingDetailsPatchBody(current, { qr: { groomBankQrMediaId: null } });
    expect(cleared.ok && cleared.value.groomBankQrMediaId).toBeNull();
    expect(cleared.ok && cleared.value.brideBankQrMediaId).toBeNull();
    expect(Object.keys(cleared.ok ? cleared.value : {})).not.toContain("qrCommonMediaId");
  });
});
