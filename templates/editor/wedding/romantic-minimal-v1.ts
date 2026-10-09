import type { TemplateEditorManifestV1 } from "../../core/editor-manifest";

/**
 * RM-01 — Template Editor Manifest for `wedding.romantic-minimal.v1`
 * (docs/DECISIONS.md "RM-01").
 *
 * `TEMPLATE_SLOTS`, one slot per photo position of the approved Task 029
 * direction, in page order: Save The Date (photo rising from the envelope),
 * Just Married (full-width landscape), Our Love (three photos in one row),
 * Wedding Album (two-column grid), Thank You (closing background). A slot is
 * a position, never a person or side. One assignment set per Project + exact
 * template version serves COMMON, GROOM and BRIDE alike (TE-03A).
 * Orientation/aspect values are advisory hints read from the direction's
 * frames, never crop rules. No INVITATION_MESSAGE or DRESS_CODE item: both
 * capabilities are false. Not in the production editor list until RM-02
 * registers the renderer.
 */
export const ROMANTIC_MINIMAL_V1_EDITOR_MANIFEST: TemplateEditorManifestV1 = {
  schemaVersion: 1,
  rendererKey: "wedding.romantic-minimal.v1",
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
      hint: "Đoạn văn ngắn dưới ba ảnh Our Love. Để trống thì mục này được ẩn.",
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
      key: "saveTheDatePhoto",
      label: "Ảnh Save The Date",
      hint: "Một ảnh dọc 3:4, nhô lên từ phong bì ở màn hình đầu tiên sau khi mở thiệp.",
      cardinality: "SINGLE",
      requirement: "RECOMMENDED",
      minCount: 0,
      recommendedCount: 1,
      maxCount: 1,
      orientation: "PORTRAIT",
      aspectRatioHint: "3:4",
      sectionKey: null,
    },
    {
      key: "justMarriedPhoto",
      label: "Ảnh Just Married",
      hint: "Một ảnh ngang 3:2, tràn chiều ngang, có chữ Just Married đặt lên ảnh.",
      cardinality: "SINGLE",
      requirement: "RECOMMENDED",
      minCount: 0,
      recommendedCount: 1,
      maxCount: 1,
      orientation: "LANDSCAPE",
      aspectRatioHint: "3:2",
      sectionKey: null,
    },
    {
      key: "ourLovePhotos",
      label: "Ba ảnh Our Love",
      hint: "Ba ảnh dọc xếp một hàng theo thứ tự vị trí 1, 2, 3, nằm trên đoạn chuyện tình yêu.",
      cardinality: "ORDERED_MULTI",
      requirement: "RECOMMENDED",
      minCount: 0,
      recommendedCount: 3,
      maxCount: 3,
      orientation: "PORTRAIT",
      aspectRatioHint: "5:7",
      sectionKey: "loveStory",
    },
    {
      key: "gallery",
      label: "Album ảnh",
      hint: "Không giới hạn số ảnh, theo thứ tự. Lưới hai cột, mỗi ô cắt theo khung dọc 4:5; khi bấm xem thì hiện ảnh đầy đủ.",
      cardinality: "ORDERED_MULTI",
      requirement: "OPTIONAL",
      minCount: 0,
      recommendedCount: 0,
      maxCount: null,
      orientation: "ANY",
      aspectRatioHint: null,
      sectionKey: "gallery",
    },
    {
      key: "thankYouPhoto",
      label: "Ảnh Thank You",
      hint: "Một ảnh ngang làm nền phần cảm ơn cuối thiệp, được phủ tối để chữ dễ đọc.",
      cardinality: "SINGLE",
      requirement: "RECOMMENDED",
      minCount: 0,
      recommendedCount: 1,
      maxCount: 1,
      orientation: "LANDSCAPE",
      aspectRatioHint: null,
      sectionKey: null,
    },
  ],
};
