import type { TemplateEditorManifestV1 } from "../../core/editor-manifest";

/**
 * TE-02 — Template Editor Manifest for `wedding.vietnamese-heritage.v1`
 * (docs/DECISIONS.md "TE-02").
 *
 * `TEMPLATE_SLOTS`: Staff fill the template's visual positions from the
 * Project media library. A slot is a position, never a person or side:
 * `portraitCluster` is positions 1 / 2 / 3, and all three may be couple
 * photos. One assignment set per Project + exact template version serves
 * COMMON, GROOM and BRIDE alike (TE-03A). Orientation/aspect values are
 * advisory hints taken from the approved direction, never crop rules. No
 * INVITATION_MESSAGE item: the v1 capability is false (VH-01). The approved
 * visual design is unchanged by this metadata.
 */
export const VIETNAMESE_HERITAGE_V1_EDITOR_MANIFEST: TemplateEditorManifestV1 = {
  schemaVersion: 1,
  rendererKey: "wedding.vietnamese-heritage.v1",
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
