import { allowedMimeTypesForMediaType, maxBytesForMediaType, type MediaType } from "../domain";
import { classifyMediaOrientation } from "../invitation-rendering/media-orientation";
import { DRESS_CODE_SWATCH_COLOR_PATTERN } from "../invitation-rendering/snapshot-payload-types";
import type { ProjectMediaRecord } from "../server/media/media-types";
import type {
  SaveWeddingDetailsInput,
  WeddingDetailsRecord,
} from "../server/wedding-details/wedding-details-types";

/**
 * Pure staff-editor logic for the optional content the frozen Elegant
 * Editorial Snapshot already consumes (media roles, Timeline, Dress Code,
 * Gift/Love Story text). No renderer knowledge beyond the roles themselves;
 * section visibility stays with the Snapshot builder.
 */

// ---------------------------------------------------------------------------
// Media roles
// ---------------------------------------------------------------------------

export interface MediaRoleConfig {
  mediaType: MediaType;
  label: string;
  hint: string;
  /** SINGLE: the first row (sort_order, id) is the effective one. MULTI: every row, in order. */
  cardinality: "SINGLE" | "MULTI";
  /** Empty-state text; defaults to "Chưa có tệp." */
  emptyLabel?: string;
}

/**
 * The Snapshot media roles (build-snapshot-payload.ts `projectMedia`), plus
 * SOCIAL_SHARE_COVER (publication metadata, never in the Snapshot). QR
 * roles are deliberately absent: Gift QR is owned by the per-side
 * wedding_details `*BankQrMediaId` references, never by role selection.
 */
export const MEDIA_EDITOR_ROLES: readonly MediaRoleConfig[] = [
  { mediaType: "COVER", label: "Ảnh bìa", hint: "Ảnh đầu tiên theo thứ tự đang được dùng.", cardinality: "SINGLE" },
  { mediaType: "PORTRAIT_GROOM", label: "Ảnh chân dung chú rể", hint: "Chỉ dùng cho chú rể.", cardinality: "SINGLE" },
  // Product Owner correction 2026-10-07: the centre couple portrait is its own role, never Ảnh bìa (COVER).
  {
    mediaType: "PORTRAIT_COUPLE",
    label: "Ảnh cặp đôi",
    hint: "Ảnh chân dung cặp đôi đặt ở giữa ảnh chú rể và cô dâu. Tách biệt với Ảnh bìa.",
    cardinality: "SINGLE",
  },
  { mediaType: "PORTRAIT_BRIDE", label: "Ảnh chân dung cô dâu", hint: "Chỉ dùng cho cô dâu.", cardinality: "SINGLE" },
  {
    mediaType: "PHOTO_STORY",
    label: "Photo Story",
    hint: "Nhiều ảnh, theo thứ tự. Mẫu hiện tại hiển thị tối đa 5 ảnh đầu tiên. Tách biệt với Album.",
    cardinality: "MULTI",
  },
  {
    mediaType: "LOVE_STORY_PHOTO",
    label: "Ảnh Chuyện tình yêu",
    hint: "Chỉ hiển thị khi có nội dung Chuyện tình yêu.",
    cardinality: "SINGLE",
  },
  { mediaType: "GALLERY", label: "Album ảnh", hint: "Không giới hạn số ảnh, theo thứ tự.", cardinality: "MULTI" },
  { mediaType: "AUDIO", label: "Nhạc nền", hint: "MP3 hoặc M4A. Không tự phát.", cardinality: "SINGLE" },
  // Not part of the invitation body: publication / social metadata, independent of Ảnh bìa (COVER).
  {
    mediaType: "SOCIAL_SHARE_COVER",
    label: "Ảnh chia sẻ mạng xã hội",
    hint: "Ảnh hiển thị khi chia sẻ đường dẫn thiệp lên Zalo, Facebook... Khuyến nghị 1200 × 630 px (khoảng 1.91:1). Tách biệt với Ảnh bìa.",
    cardinality: "SINGLE",
    emptyLabel: "Chưa chọn ảnh chia sẻ.",
  },
];

/** RF11 rule C canonical order: sortOrder ASC, then id ASC (code-unit compare). */
export function compareBySortOrderThenId(a: { sortOrder: number; id: string }, b: { sortOrder: number; id: string }): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Rows of exactly one role, in canonical order. Other roles are never mixed in. */
export function mediaOfRole(rows: readonly ProjectMediaRecord[], mediaType: MediaType): ProjectMediaRecord[] {
  return rows.filter((row) => row.mediaType === mediaType).sort(compareBySortOrderThenId);
}

/** The row the Snapshot builder will use for a SINGLE role, or `null`. */
export function effectiveMediaOfRole(rows: readonly ProjectMediaRecord[], mediaType: MediaType): ProjectMediaRecord | null {
  return mediaOfRole(rows, mediaType)[0] ?? null;
}

/**
 * Replacing a SINGLE role creates a new row ordered before every existing row
 * of that role, so it becomes the effective one; older rows are kept (a
 * published version may still reference them) and stay deletable.
 */
export function sortOrderForReplacement(rows: readonly ProjectMediaRecord[], mediaType: MediaType): number {
  const existing = mediaOfRole(rows, mediaType);
  return existing.length === 0 ? 0 : existing[0].sortOrder - 1;
}

/** Consecutive sort orders after the role's last row, one per new file. */
export function sortOrdersForAppend(rows: readonly ProjectMediaRecord[], mediaType: MediaType, count: number): number[] {
  const existing = mediaOfRole(rows, mediaType);
  const start = existing.length === 0 ? 0 : existing[existing.length - 1].sortOrder + 1;
  return Array.from({ length: count }, (_, index) => start + index);
}

const ORIENTATION_LABELS = { PORTRAIT: "Dọc", LANDSCAPE: "Ngang", SQUARE: "Vuông" } as const;

/** e.g. "1200 × 1800 · Dọc"; `null` for audio or rows without dimensions (legacy uploads). */
export function mediaDimensionsLabel(media: Pick<ProjectMediaRecord, "width" | "height">): string | null {
  const orientation = classifyMediaOrientation(media.width, media.height);
  return orientation === null ? null : `${media.width} × ${media.height} · ${ORIENTATION_LABELS[orientation]}`;
}

/** Advisory client check mirroring the server's frozen policy (server stays authoritative). */
export function validateMediaFile(mediaType: MediaType, file: { type: string; size: number }): string | null {
  const allowed = allowedMimeTypesForMediaType(mediaType) as readonly string[];
  if (!allowed.includes(file.type)) {
    return `Định dạng không hỗ trợ. Cho phép: ${allowed.join(", ")}.`;
  }
  const maxBytes = maxBytesForMediaType(mediaType);
  if (file.size > maxBytes) {
    return `Tệp vượt quá ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ordering (shared by media, Timeline items and swatches)
// ---------------------------------------------------------------------------

/** The list with the item at `index` moved by `delta`; unchanged when out of range. */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Sort-order writes that make the given order explicit (position = sortOrder); unchanged rows are skipped. */
export function reorderPlan(ordered: readonly { id: string; sortOrder: number }[]): { id: string; sortOrder: number }[] {
  return ordered.flatMap((item, index) => (item.sortOrder === index ? [] : [{ id: item.id, sortOrder: index }]));
}

/** Next sortOrder after the last item (0 when empty). */
export function nextSortOrder(items: readonly { sortOrder: number }[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((item) => item.sortOrder)) + 1;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

const TIMELINE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type FormResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Staff enters a normal HH:mm time and a plain label; nothing is defaulted. */
export function parseTimelineForm(form: { time: string; label: string }): FormResult<{ time: string; label: string }> {
  if (!TIMELINE_TIME_PATTERN.test(form.time)) {
    return { ok: false, error: "Giờ phải có dạng HH:mm (24 giờ)." };
  }
  const label = form.label.trim();
  if (label === "") {
    return { ok: false, error: "Cần nhập nội dung." };
  }
  if (label.length > 200) {
    return { ok: false, error: "Nội dung tối đa 200 ký tự." };
  }
  return { ok: true, value: { time: form.time, label } };
}

// ---------------------------------------------------------------------------
// Dress Code
// ---------------------------------------------------------------------------

/** Explicit staff entry → canonical lowercase `#rrggbb`, or an error. Never a default colour. */
export function parseSwatchColor(raw: string): FormResult<string> {
  const color = raw.trim().toLowerCase();
  if (!DRESS_CODE_SWATCH_COLOR_PATTERN.test(color)) {
    return { ok: false, error: "Màu phải có dạng #rrggbb." };
  }
  return { ok: true, value: color };
}

export function parseDressCodeDescription(raw: string): FormResult<string | null> {
  const description = raw.trim();
  if (description.length > 1000) {
    return { ok: false, error: "Mô tả tối đa 1000 ký tự." };
  }
  return { ok: true, value: description === "" ? null : description };
}

// ---------------------------------------------------------------------------
// Gift / Love Story (existing canonical wedding_details full-replace PUT)
// ---------------------------------------------------------------------------

export const GIFT_CONTENT_FIELDS = [
  "loveStory",
  "groomBankName",
  "groomBankAccountName",
  "groomBankAccountNumber",
  "brideBankName",
  "brideBankAccountName",
  "brideBankAccountNumber",
] as const satisfies readonly (keyof SaveWeddingDetailsInput)[];

export type GiftContentField = (typeof GIFT_CONTENT_FIELDS)[number];
export type GiftContentForm = Record<GiftContentField, string>;
export type GiftQrPatch = Partial<Pick<SaveWeddingDetailsInput, "groomBankQrMediaId" | "brideBankQrMediaId">>;

const FULL_REPLACE_FIELDS = [
  "groomName",
  "brideName",
  "groomFather",
  "groomMother",
  "brideFather",
  "brideMother",
  "groomFamilyAddress",
  "brideFamilyAddress",
  "invitationMessage",
  "loveStory",
  "lunarDateDisplay",
  "additionalNote",
  "groomBankName",
  "groomBankAccountName",
  "groomBankAccountNumber",
  "groomBankQrMediaId",
  "brideBankName",
  "brideBankAccountName",
  "brideBankAccountNumber",
  "brideBankQrMediaId",
] as const satisfies readonly (keyof SaveWeddingDetailsInput)[];

/** Canonical family fields (wedding_details; Snapshot `families`). */
export const FAMILY_FIELDS = [
  "groomFather",
  "groomMother",
  "groomFamilyAddress",
  "brideFather",
  "brideMother",
  "brideFamilyAddress",
] as const satisfies readonly (keyof SaveWeddingDetailsInput)[];

export type FamilyField = (typeof FAMILY_FIELDS)[number];
export type FamilyForm = Record<FamilyField, string>;

export function familyFormFrom(details: WeddingDetailsRecord | null): FamilyForm {
  const form = {} as FamilyForm;
  for (const field of FAMILY_FIELDS) form[field] = details?.[field] ?? "";
  return form;
}

export function giftContentFormFrom(details: WeddingDetailsRecord | null): GiftContentForm {
  const form = {} as GiftContentForm;
  for (const field of GIFT_CONTENT_FIELDS) form[field] = details?.[field] ?? "";
  return form;
}

/**
 * The existing PUT is a full canonical replace: every current field is
 * re-sent unchanged, then only the edited fields are applied (blank → null).
 * Requires saved wedding details (the couple names are mandatory there).
 */
export function buildWeddingDetailsPatchBody(
  current: WeddingDetailsRecord | null,
  edits: { form?: GiftContentForm; family?: FamilyForm; qr?: GiftQrPatch },
): FormResult<SaveWeddingDetailsInput> {
  if (current === null) {
    return { ok: false, error: "Cần lưu tên cô dâu và chú rể trước." };
  }
  const body = {} as SaveWeddingDetailsInput;
  for (const field of FULL_REPLACE_FIELDS) body[field] = current[field];
  if (edits.form) {
    for (const field of GIFT_CONTENT_FIELDS) {
      const value = edits.form[field].trim();
      body[field] = value === "" ? null : value;
    }
  }
  if (edits.family) {
    for (const field of FAMILY_FIELDS) {
      const value = edits.family[field].trim();
      body[field] = value === "" ? null : value;
    }
  }
  if (edits.qr) {
    if ("groomBankQrMediaId" in edits.qr) body.groomBankQrMediaId = edits.qr.groomBankQrMediaId ?? null;
    if ("brideBankQrMediaId" in edits.qr) body.brideBankQrMediaId = edits.qr.brideBankQrMediaId ?? null;
  }
  return { ok: true, value: body };
}
