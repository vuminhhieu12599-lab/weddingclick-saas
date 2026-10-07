/**
 * Vietnamese Heritage v1 — fixed template-owned Vietnamese copy
 * (docs/DECISIONS.md "VH-01 …" mapping, class B).
 *
 * Part of the immutable v1 renderer: never persisted customer content,
 * never read from the ViewModel, never templated with customer data. Nothing
 * here is a date, weekday, lunar value, venue or name; those come only from
 * canonical data. Section `heading` values without a visible Task 029
 * heading are accessible names only.
 */

export const VIETNAMESE_HERITAGE_V1_COPY = Object.freeze({
  a11y: Object.freeze({
    /** Joins the two canonical names in accessible text. */
    and: "và",
    /** The Song Hỷ (囍) mark's accessible name. */
    songHy: "Song Hỷ",
  }),
  opening: Object.freeze({
    /** Task 029 cover title. */
    label: "Thiệp Mời Cưới",
  }),
  hero: Object.freeze({
    /** Hero photo alt prefix, followed by the couple. */
    photoAlt: "Ảnh cưới",
  }),
  ceremonial: Object.freeze({
    heading: "Gia đình hai bên",
    /** Family column labels, chosen by the family's explicit `side`, never by position. */
    labelBySide: Object.freeze({ GROOM: "Nhà Trai", BRIDE: "Nhà Gái" }),
    /** Portrait alt prefix, followed by the canonical name. */
    portraitAlt: "Ảnh",
    /** Task 029 salutation line. */
    salutation: "Trân Trọng Kính Mời",
    /** Unpersonalized invitation: stands in for the absent guest overlay (VH-02 open question). */
    defaultGuest: "Quý khách",
    monthPrefix: "Tháng",
    /** Separate label placed beside the verbatim canonical lunar text; never concatenated into it. */
    lunarLabel: "Tức ngày",
  }),
  events: Object.freeze({
    heading: "Chương trình",
    mapLink: "Xem chỉ đường",
  }),
  timeline: Object.freeze({
    heading: "Lịch trình",
  }),
  loveStory: Object.freeze({
    eyebrow: "Love Story",
    heading: "Chuyện Chúng Mình",
    photoAlt: "Ảnh chuyện tình",
  }),
  gift: Object.freeze({
    heading: "Gửi Quà Cưới",
    /** Task 029 gift intro note. */
    intro:
      "Sự hiện diện của bạn là món quà quý giá nhất. Nếu muốn gửi lời chúc mừng, gia đình xin phép nhận tại đây.",
    bankName: "Ngân hàng",
    accountName: "Chủ tài khoản",
    accountNumber: "Số tài khoản",
    qrAlt: "Mã QR chuyển khoản",
  }),
  dressCode: Object.freeze({
    heading: "Dress Code",
    swatchLabel: "Màu gợi ý",
  }),
  gallery: Object.freeze({
    heading: "Khoảnh Khắc Của Chúng Mình",
    imageAlt: "Ảnh cưới",
    unavailable: "Ảnh hiện chưa khả dụng",
  }),
  closing: Object.freeze({
    heading: "Lời cảm ơn",
    /** Task 029 closing wording, as fixed template copy. */
    message: Object.freeze([
      "Sự hiện diện của bạn là niềm hạnh phúc trọn vẹn",
      "nhất trong ngày cưới của chúng tôi.",
      "Xin chân thành cảm ơn.",
    ] as const),
  }),
});
