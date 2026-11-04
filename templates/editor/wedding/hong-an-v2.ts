import type { TemplateEditorManifestV1 } from "../../core/editor-manifest";

/**
 * HA-CONTENT-01 — Template Editor Manifest for `wedding.hong-an.v2`.
 *
 * Identical to v1's, because v2 changes no media slot and no canonical
 * content item: the Scripture quote is template-owned copy configured
 * through `designSettings`, not canonical Project content, so it gets no
 * `contentItems` entry (TE-01 T1 — this manifest never holds customer
 * content, and `TEMPLATE_EDITOR_CONTENT_KEYS` is a closed set that no
 * template may extend). Its Staff card is driven by the design manifest
 * instead; see `app/admin/v2/projects/[projectId]/_components/
 * scripture-editor.tsx`.
 *
 * `TEMPLATE_SLOTS`, in the page order of the approved Hồng Ân direction.
 * Four slots cover every art-directed frame, because the album is a LAYOUT
 * over one ordered list — the same arrangement Se Duyên and Our Wedding
 * Story use, so no new slot convention is introduced.
 *
 * Every slot key names a POSITION (TE-01 T1, TE-03A). This direction has no
 * person-bound frame — the opening photograph is the couple's, not one
 * side's — so it needs none of the per-person portrait exception. One
 * assignment set per Project + exact template version serves COMMON, GROOM
 * and BRIDE alike (TE-03A).
 *
 * Orientation and aspect values are advisory Staff hints read off the
 * approved frames; they are never crop rules, never validation and never
 * blocking.
 *
 * `openingPhoto` IS THE ONE THAT MATTERS. The doors open onto it and it
 * becomes the hero, so it is RECOMMENDED with `recommendedCount: 1`. That
 * is a readiness NUDGE in the Staff editor, not a gate: the V1 editor
 * contract cannot express a required media slot (`minCount` must be 0 and
 * no media slot may be REQUIRED, TE-01 T10). With no photograph the doors
 * still open, onto the template's own warm light rather than a substitute
 * picture, and the invitation below is complete.
 *
 * Content items follow the renderer's declared capabilities; the production
 * editor registry rejects an item or slot naming an incapable section.
 * TIMELINE needs no item (it is its own canonical table on its own screen).
 * No DRESS_CODE item: the approved composition has none.
 */
export const HONG_AN_V2_EDITOR_MANIFEST: TemplateEditorManifestV1 = {
  schemaVersion: 1,
  rendererKey: "wedding.hong-an.v2",
  mediaModel: "TEMPLATE_SLOTS",
  contentItems: [
    {
      key: "COUPLE",
      label: "Cô dâu & chú rể",
      hint: "Họ tên cô dâu và chú rể. Tên hiện trên cánh cửa nhà thờ, trên ảnh cưới lớn và ở lời cảm ơn cuối thiệp.",
      requirement: "REQUIRED",
      sectionKey: null,
    },
    {
      key: "EVENTS",
      label: "Sự kiện",
      hint: "Cần lễ chính (Thành Hôn hoặc Vu Quy) với ngày giờ, nhà thờ/địa điểm và địa chỉ. Tiệc cưới là sự kiện riêng, có giờ và nơi riêng.",
      requirement: "REQUIRED",
      sectionKey: null,
    },
    {
      key: "FAMILIES",
      label: "Gia đình hai bên",
      hint: "Tên bố mẹ và địa chỉ nhà trai, nhà gái. Tên hiện đúng như đã nhập, dưới dòng Nhà Trai / Nhà Gái.",
      requirement: "RECOMMENDED",
      sectionKey: null,
    },
    {
      key: "INVITATION_MESSAGE",
      label: "Lời mời",
      hint: "Lời mời riêng của gia đình, hiện trong mục Hân Hoan Báo Tin. Bỏ trống sẽ dùng lời mời mặc định của mẫu Hồng Ân.",
      requirement: "RECOMMENDED",
      sectionKey: "invitationMessage",
    },
    {
      key: "LOVE_STORY",
      label: "Hành trình yêu thương",
      hint: "Câu chuyện của hai bạn, viết tự do. Mỗi đoạn cách nhau một dòng trống sẽ thành một đoạn văn riêng.",
      requirement: "OPTIONAL",
      sectionKey: "loveStory",
    },
    {
      key: "MUSIC",
      label: "Nhạc nền",
      hint: "Một bản nhạc nền. Khách tự bấm nút để nghe — thiệp không bao giờ tự phát nhạc.",
      requirement: "OPTIONAL",
      sectionKey: "music",
    },
    {
      key: "GIFT",
      label: "Mừng cưới",
      hint: "Ngân hàng, chủ tài khoản và số tài khoản của từng bên, kèm mã QR nếu có. Bên nào không có thông tin thì không hiện.",
      requirement: "OPTIONAL",
      sectionKey: "gift",
    },
  ],
  mediaSlots: [
    {
      key: "openingPhoto",
      label: "Ảnh sau cánh cửa",
      hint: "Ảnh cưới chính. Nằm sẵn sau hai cánh cửa nhà thờ và trở thành ảnh lớn toàn màn hình khi cửa mở, nên hãy chọn ảnh dọc, khuôn mặt ở khoảng giữa trên.",
      cardinality: "SINGLE",
      requirement: "RECOMMENDED",
      minCount: 0,
      recommendedCount: 1,
      maxCount: 1,
      orientation: "PORTRAIT",
      // HA-INTEGRATION-01: the full-screen phone frame (9:19.5) as the
      // equal whole-number ratio the shared "W:H" contract requires.
      aspectRatioHint: "6:13",
      sectionKey: null,
    },
    {
      key: "storyPhoto",
      label: "Ảnh hành trình yêu thương",
      hint: "Một ảnh đi kèm câu chuyện của hai bạn, đặt trong khung vòm nhọn.",
      cardinality: "SINGLE",
      requirement: "OPTIONAL",
      minCount: 0,
      recommendedCount: 0,
      maxCount: 1,
      orientation: "PORTRAIT",
      aspectRatioHint: "4:5",
      sectionKey: "loveStory",
    },
    {
      key: "gallery",
      label: "Khoảnh khắc",
      hint: "Album ảnh cưới, hiện theo đúng thứ tự bạn sắp. Ảnh dọc và ảnh ngang đều dùng được; bấm vào một ảnh để xem lớn.",
      cardinality: "ORDERED_MULTI",
      requirement: "RECOMMENDED",
      minCount: 0,
      recommendedCount: 6,
      maxCount: null,
      orientation: "ANY",
      aspectRatioHint: null,
      sectionKey: "gallery",
    },
    {
      key: "closingPhoto",
      label: "Ảnh lời cảm ơn",
      hint: "Một ảnh khép lại thiệp, phía trên lời cảm ơn. Không bắt buộc — không có ảnh thì phần kết vẫn trọn vẹn.",
      cardinality: "SINGLE",
      requirement: "OPTIONAL",
      minCount: 0,
      recommendedCount: 0,
      maxCount: 1,
      orientation: "PORTRAIT",
      aspectRatioHint: "4:5",
      sectionKey: null,
    },
  ],
};
