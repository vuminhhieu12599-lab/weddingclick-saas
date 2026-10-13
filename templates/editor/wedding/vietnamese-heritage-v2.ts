import type { TemplateEditorManifestV1 } from "../../core/editor-manifest";

/**
 * Template Editor Manifest for `wedding.vietnamese-heritage.v2`
 * (docs/DECISIONS.md "TE-02", "VH-V2-01").
 *
 * Identical slots, content items and hints to Vietnamese Heritage v1: v2
 * changes only fixed copy, typography and motion, never the editor
 * contract. Slot assignments are stored per exact template version
 * (TE-03B), so a Project moved from v1 to v2 is assigned its photos again
 * for v2; v1 assignments are kept. `TEMPLATE_SLOTS`; a slot is a position,
 * never a person or side. No INVITATION_MESSAGE item (capability false).
 */
export const VIETNAMESE_HERITAGE_V2_EDITOR_MANIFEST: TemplateEditorManifestV1 = {
  schemaVersion: 1,
  rendererKey: "wedding.vietnamese-heritage.v2",
  mediaModel: "TEMPLATE_SLOTS",
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
  mediaSlots: [
    {
      key: "heroPhoto",
      label: "Ảnh chính",
      hint: "Một ảnh dọc, phủ kín khung ở phần mở đầu. Không có ảnh thì phần mở đầu chỉ dùng chữ.",
      cardinality: "SINGLE",
      requirement: "RECOMMENDED",
      minCount: 0,
      recommendedCount: 1,
      maxCount: 1,
      orientation: "PORTRAIT",
      aspectRatioHint: null,
      sectionKey: null,
    },
    {
      key: "portraitCluster",
      label: "Cụm ảnh ba khung",
      hint: "Ba ảnh dọc theo thứ tự vị trí 1, 2, 3. Đây là vị trí trong bố cục, không phải chú rể / cặp đôi / cô dâu; có thể dùng ảnh cặp đôi cho cả ba.",
      cardinality: "ORDERED_MULTI",
      requirement: "RECOMMENDED",
      minCount: 0,
      recommendedCount: 3,
      maxCount: 3,
      orientation: "PORTRAIT",
      aspectRatioHint: null,
      sectionKey: null,
    },
    {
      key: "loveStoryPhoto",
      label: "Ảnh chuyện tình yêu",
      hint: "Ảnh nền của mục Chuyện tình yêu, được phủ tối để chữ dễ đọc. Không bắt buộc.",
      cardinality: "SINGLE",
      requirement: "OPTIONAL",
      minCount: 0,
      recommendedCount: 0,
      maxCount: 1,
      orientation: "ANY",
      aspectRatioHint: null,
      sectionKey: "loveStory",
    },
    {
      key: "gallery",
      label: "Album ảnh",
      hint: "Không giới hạn số ảnh, theo thứ tự. Bố cục tự sắp theo ảnh dọc và ảnh ngang.",
      cardinality: "ORDERED_MULTI",
      requirement: "OPTIONAL",
      minCount: 0,
      recommendedCount: 0,
      maxCount: null,
      orientation: "ANY",
      aspectRatioHint: null,
      sectionKey: "gallery",
    },
  ],
};
