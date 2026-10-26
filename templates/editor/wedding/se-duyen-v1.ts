import type { TemplateEditorManifestV1 } from "../../core/editor-manifest";

/**
 * SD-V1-02A — Template Editor Manifest for `wedding.se-duyen.v1`.
 *
 * `TEMPLATE_SLOTS`, in the page order of the approved "Se Duyên — Hộp Cưới"
 * direction: the photograph inside the wedding box, the couple page's lead
 * frame and its smaller supporting frame, the ordered album, and the closing
 * photograph. Five slots cover the direction's eight art-directed frames,
 * because the album's four frames are a LAYOUT over one ordered list — the
 * same arrangement Our Wedding Story v1 uses for its magazine rows, so no
 * new slot convention is introduced.
 *
 * Every slot key names a POSITION (TE-01 T1, TE-03A). The direction has no
 * person-bound frame, so it needs none of the OWS-01 `groomPortrait` /
 * `bridePortrait` exception: `portraitLead` and `portraitAside` are the large
 * and small frames of the couple page, whichever person the variant resolver
 * puts first. One assignment set per Project + exact template version serves
 * COMMON, GROOM and BRIDE alike (TE-03A).
 *
 * Orientation and aspect values are advisory hints read off the approved
 * frames (the lead frame is the direction's own 1086×1448, the aside and
 * closing frames are 4:5), never crop rules and never validation.
 *
 * Content items follow the renderer's capabilities: the production editor
 * registry rejects an item or slot naming an incapable section. TIMELINE
 * needs no item (it is its own canonical table, configured on its own
 * screen); MUSIC arrived with SD-V1-02C1 and GIFT with SD-V1-02C2. No
 * DRESS_CODE item: the approved composition has no dress code.
 *
 * AT LEAST ONE REAL CUSTOMER PHOTOGRAPH IS REQUIRED BEFORE PUBLICATION
 * (Product Owner decision, 2026-10-21). The opening is built around a
 * photograph that rises out of the box and grows into the hero, and this
 * direction has no approved opening without one.
 *
 * THIS MANIFEST DOES NOT ENFORCE THAT RULE, and must not be read as if it
 * did. The V1 editor contract cannot express it: `minCount` must be 0 for
 * every slot and no media slot may be REQUIRED (TE-01 T10), so the strongest
 * available signal here is `openingPhoto` being RECOMMENDED with
 * `recommendedCount: 1` — a readiness NUDGE in the Staff editor, not a gate.
 * A Project with no photograph at all still passes every check expressed
 * here.
 *
 * SD-V1-RELEASE-01 enforces the rule server-side instead, where it belongs:
 * `lib/server/invitation-review/publication-readiness.ts` blocks REVIEW
 * creation — and therefore publication — until at least one real customer
 * photograph is assigned to ANY of the five slots below, the album included.
 * No single slot is privileged, so the `openingPhoto` nudge stays a nudge.
 */
export const SE_DUYEN_V1_EDITOR_MANIFEST: TemplateEditorManifestV1 = {
  schemaVersion: 1,
  rendererKey: "wedding.se-duyen.v1",
  mediaModel: "TEMPLATE_SLOTS",
  contentItems: [
    {
      key: "COUPLE",
      label: "Cô dâu & chú rể",
      hint: "Họ tên đầy đủ của cô dâu và chú rể. Tên hiện trên bìa hộp, trên ảnh lớn và ở lời cảm ơn cuối thiệp.",
      requirement: "REQUIRED",
      sectionKey: null,
    },
    {
      key: "EVENTS",
      label: "Sự kiện",
      hint: "Cần lễ chính (Thành Hôn hoặc Vu Quy) với ngày giờ và địa điểm. Mỗi bên nhà giữ giờ và địa chỉ riêng của mình.",
      requirement: "REQUIRED",
      sectionKey: null,
    },
    {
      key: "FAMILIES",
      label: "Gia đình hai bên",
      hint: "Tên bố mẹ và địa chỉ nhà trai, nhà gái. Tên hiện ngay dưới dòng Nhà Trai / Nhà Gái, đúng như đã nhập.",
      requirement: "RECOMMENDED",
      sectionKey: null,
    },
    {
      key: "INVITATION_MESSAGE",
      label: "Lời mời",
      hint: "Câu mời của gia đình, in trên tấm thiệp ngà. Để trống thì tấm thiệp chỉ còn lời chào và tên khách. Có thể dùng hai mã: {guest} thay bằng tên khách, {ceremonyTitle} thay bằng Lễ Thành Hôn hoặc Lễ Vu Quy theo từng bên. Viết đúng chữ hoa chữ thường; mã khác sẽ không tạo được bản duyệt.",
      requirement: "OPTIONAL",
      sectionKey: "invitationMessage",
    },
    {
      key: "LOVE_STORY",
      label: "Chuyện tình yêu",
      hint: "Đoạn văn dưới tên cô dâu chú rể ở trang Uyên Ương. Để trống thì đoạn này được ẩn.",
      requirement: "OPTIONAL",
      sectionKey: "loveStory",
    },
    {
      key: "GIFT",
      label: "Mừng cưới",
      hint: "Ngân hàng, chủ tài khoản, số tài khoản và mã QR của từng bên. Bên nào không có thì không hiện; không bên nào có thì không hiện phong bì.",
      requirement: "OPTIONAL",
      sectionKey: "gift",
    },
    {
      key: "MUSIC",
      label: "Nhạc nền",
      hint: "Một bản nhạc MP3 hoặc M4A. Không tự phát: khách tự bấm vào nút nhạc trong thiệp. Không có nhạc thì không hiện nút.",
      requirement: "OPTIONAL",
      sectionKey: "music",
    },
  ],
  mediaSlots: [
    {
      key: "openingPhoto",
      label: "Ảnh trong hộp cưới",
      hint: "Một ảnh dọc. Ảnh này nằm trong hộp, nhô lên khi khách chạm mở hộp rồi lớn dần thành ảnh nền toàn màn hình. Nên có ít nhất ảnh này.",
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
      key: "portraitLead",
      label: "Ảnh lớn trang Uyên Ương",
      hint: "Một ảnh dọc, khung lớn ở trang Uyên Ương. Không có ảnh thì trang này chỉ hiện tên và chuyện tình yêu.",
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
      key: "portraitAside",
      label: "Ảnh nhỏ trang Uyên Ương",
      hint: "Một ảnh dọc, khung nhỏ chồng lên góc dưới của ảnh lớn. Chỉ hiện khi đã có ảnh lớn; không có thì ảnh lớn đứng một mình.",
      cardinality: "SINGLE",
      requirement: "OPTIONAL",
      minCount: 0,
      recommendedCount: 0,
      maxCount: 1,
      orientation: "PORTRAIT",
      aspectRatioHint: "4:5",
      sectionKey: null,
    },
    {
      key: "gallery",
      label: "Album cưới",
      hint: "Không giới hạn số ảnh, theo thứ tự. Bố cục bốn khung: một ảnh lớn, một cặp cao–nhỏ, rồi một ảnh ngang ở cuối; khung chưa có ảnh thì được bỏ đi, không lấy ảnh khác lấp vào. Bấm vào ảnh để xem đầy đủ.",
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
      key: "closingPhoto",
      label: "Ảnh lời cảm ơn",
      hint: "Một ảnh dọc ở phần cảm ơn cuối thiệp, chân ảnh tan dần vào nền sơn mài. Không có ảnh thì chỉ hiện lời cảm ơn và hai tên.",
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
