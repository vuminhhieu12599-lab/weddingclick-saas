import type { TemplateEditorManifestV1 } from "../../core/editor-manifest";

/**
 * OWS-01 — Template Editor Manifest for `wedding.our-wedding-story.v1`
 * (docs/DECISIONS.md "OWS-01").
 *
 * `TEMPLATE_SLOTS`, in page order of the approved Visual Freeze v1: cover
 * photo, the two Couple portraits, the photo beside the love story, the
 * gallery and the Thank You photo. Every slot is a position, except
 * `groomPortrait` / `bridePortrait`: the one Product Owner-approved
 * exception (OWS-01), bound to a stable person identity so the photo and its
 * caption always follow that person (COMMON/GROOM: groom first; BRIDE: bride
 * first). One assignment set per Project + exact template version serves
 * COMMON, GROOM and BRIDE alike (TE-03A). Orientation/aspect values are
 * advisory hints read from the direction's frames, never crop rules. No
 * INVITATION_MESSAGE, TIMELINE or DRESS_CODE item: those capabilities are
 * false.
 */
export const OUR_WEDDING_STORY_V1_EDITOR_MANIFEST: TemplateEditorManifestV1 = {
  schemaVersion: 1,
  rendererKey: "wedding.our-wedding-story.v1",
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
      hint: "Đoạn văn trong mục The Couple. Để trống thì đoạn này và ảnh đi kèm được ẩn.",
      requirement: "OPTIONAL",
      sectionKey: "loveStory",
    },
    {
      key: "GIFT",
      label: "Mừng cưới",
      hint: "Tài khoản ngân hàng và mã QR của từng bên. Để trống thì nút mừng cưới được ẩn.",
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
      key: "coverPhoto",
      label: "Ảnh bìa",
      hint: "Một ảnh dọc ở trang bìa, dưới tiêu đề Our Wedding Story. Không có ảnh thì bìa chỉ dùng chữ.",
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
      key: "groomPortrait",
      label: "Ảnh chân dung chú rể",
      hint: "Ảnh dọc của chú rể trong mục The Couple, luôn đi kèm tên chú rể. Không có ảnh thì hiện khối tên.",
      cardinality: "SINGLE",
      requirement: "OPTIONAL",
      minCount: 0,
      recommendedCount: 0,
      maxCount: 1,
      orientation: "PORTRAIT",
      aspectRatioHint: "3:4",
      sectionKey: null,
    },
    {
      key: "bridePortrait",
      label: "Ảnh chân dung cô dâu",
      hint: "Ảnh dọc của cô dâu trong mục The Couple, luôn đi kèm tên cô dâu. Không có ảnh thì hiện khối tên.",
      cardinality: "SINGLE",
      requirement: "OPTIONAL",
      minCount: 0,
      recommendedCount: 0,
      maxCount: 1,
      orientation: "PORTRAIT",
      aspectRatioHint: "3:4",
      sectionKey: null,
    },
    {
      key: "storyPhoto",
      label: "Ảnh chuyện tình yêu",
      hint: "Một ảnh ngang tràn chiều ngang phía trên đoạn chuyện tình yêu. Chỉ hiện khi có chuyện tình yêu.",
      cardinality: "SINGLE",
      requirement: "OPTIONAL",
      minCount: 0,
      recommendedCount: 0,
      maxCount: 1,
      orientation: "LANDSCAPE",
      aspectRatioHint: "4:3",
      sectionKey: "loveStory",
    },
    {
      key: "gallery",
      label: "Album ảnh",
      hint: "Không giới hạn số ảnh, theo thứ tự. Bố cục tạp chí: mỗi hàng một ảnh lớn và hai ảnh nhỏ; khi bấm xem thì hiện ảnh đầy đủ.",
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
      hint: "Một ảnh dọc ở phần cảm ơn cuối thiệp, có chữ Thank you đặt lên ảnh. Không có ảnh thì hiện khung chữ.",
      cardinality: "SINGLE",
      requirement: "RECOMMENDED",
      minCount: 0,
      recommendedCount: 1,
      maxCount: 1,
      orientation: "PORTRAIT",
      aspectRatioHint: "4:5",
      sectionKey: null,
    },
  ],
};
