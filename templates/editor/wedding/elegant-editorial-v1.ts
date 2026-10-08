import type { TemplateEditorManifestV1 } from "../../core/editor-manifest";

/**
 * TE-02 — Template Editor Manifest for `wedding.elegant-editorial.v1`
 * (docs/DECISIONS.md "TE-02").
 *
 * Lives outside the frozen Elegant Editorial v1 renderer directory, which is
 * never edited after release. `LEGACY_ROLES`: Staff keep editing the existing
 * legacy media roles (`MEDIA_EDITOR_ROLES`), so there are no template slots.
 * No INVITATION_MESSAGE item: the v1 capability is false (Micro-Checkpoint 10
 * Product Owner ruling). Validated by the production editor registry.
 */
export const ELEGANT_EDITORIAL_V1_EDITOR_MANIFEST: TemplateEditorManifestV1 = {
  schemaVersion: 1,
  rendererKey: "wedding.elegant-editorial.v1",
  mediaModel: "LEGACY_ROLES",
  contentItems: [
    {
      key: "COUPLE",
      label: "Cô dâu & chú rể",
      hint: "Họ tên đầy đủ của cô dâu và chú rể.",
      requirement: "REQUIRED",
      sectionKey: null,
    },
    {
      key: "EVENTS",
      label: "Sự kiện",
      hint: "Cần lễ chính (Thành Hôn hoặc Vu Quy) với ngày giờ và địa điểm.",
      requirement: "REQUIRED",
      sectionKey: null,
    },
    {
      key: "FAMILIES",
      label: "Gia đình hai bên",
      hint: "Tên bố mẹ và địa chỉ nhà trai, nhà gái.",
      requirement: "RECOMMENDED",
      sectionKey: null,
    },
    {
      key: "LOVE_STORY",
      label: "Chuyện tình yêu",
      hint: "Đoạn văn ngắn về hai bạn. Để trống thì mục này được ẩn.",
      requirement: "OPTIONAL",
      sectionKey: "loveStory",
    },
    {
      key: "TIMELINE",
      label: "Lịch trình",
      hint: "Các mốc giờ trong ngày cưới. Để trống thì mục này được ẩn.",
      requirement: "OPTIONAL",
      sectionKey: "timeline",
    },
    {
      key: "DRESS_CODE",
      label: "Dress code",
      hint: "Mô tả trang phục và bảng màu. Để trống thì mục này được ẩn.",
      requirement: "OPTIONAL",
      sectionKey: "dressCode",
    },
    {
      key: "GIFT",
      label: "Mừng cưới",
      hint: "Tài khoản ngân hàng và mã QR của từng bên. Để trống thì mục này được ẩn.",
      requirement: "OPTIONAL",
      sectionKey: "gift",
    },
    {
      key: "MUSIC",
      label: "Nhạc nền",
      hint: "Một bản nhạc MP3 hoặc M4A, không tự phát. Không có nhạc thì không hiện nút nhạc.",
      requirement: "OPTIONAL",
      sectionKey: "music",
    },
  ],
  mediaSlots: [],
};
