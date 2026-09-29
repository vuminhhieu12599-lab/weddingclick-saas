/**
 * Elegant Editorial v1 — fixed template-owned Vietnamese copy
 * (docs/DECISIONS.md "RF-06-0 First Production Renderer Contract
 * Clarification" P7, P10).
 *
 * Part of the immutable v1 renderer: never persisted customer content,
 * never read from the ViewModel, never templated with customer data. A copy
 * change after the RF-06F freeze is v2. Nothing here is a date, weekday,
 * lunar value, venue or name; those come only from canonical data.
 */

export const ELEGANT_EDITORIAL_V1_COPY = Object.freeze({
  opening: Object.freeze({
    label: "Thiệp mời cưới",
    /** Precedes the guest line; the guest line is presentation text only. */
    salutation: "Trân trọng kính mời",
    /** Unpersonalized invitation: stands in for the absent guest overlay. */
    defaultGuest: "Quý khách",
  }),
  hero: Object.freeze({
    kicker: "Save the date",
  }),
  couple: Object.freeze({
    heading: "Cô dâu & Chú rể",
    /** Role labels chosen by the person's explicit `side`, never by position. */
    roleBySide: Object.freeze({ GROOM: "Chú rể", BRIDE: "Cô dâu" }),
  }),
  message: Object.freeze({
    heading: "Thư mời",
  }),
  families: Object.freeze({
    heading: "Gia đình hai bên",
    /** Family side labels chosen by the family's explicit `side` (P7, RF5). */
    labelBySide: Object.freeze({ GROOM: "Nhà Trai", BRIDE: "Nhà Gái" }),
  }),
  ceremony: Object.freeze({
    monthPrefix: "Tháng",
    /** Separate label placed beside the verbatim canonical lunar text; never concatenated into it. */
    lunarLabel: "Tức ngày",
  }),
  calendar: Object.freeze({
    heading: "Lịch ngày cưới",
    intro: "Ngày chung đôi của chúng mình",
    monthPrefix: "Tháng",
    /** Monday → Sunday, matching the RF-05C Monday-first grid (K33). */
    weekdayHeaders: Object.freeze(["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const),
    ceremonyDayNote: "Ngày cưới",
  }),
  events: Object.freeze({
    heading: "Chương trình",
    mapLink: "Xem chỉ đường",
  }),
  loveStory: Object.freeze({
    heading: "Chuyện của chúng mình",
  }),
  gallery: Object.freeze({
    heading: "Album ảnh cưới",
    unavailable: "Ảnh tạm thời chưa hiển thị",
    imageAlt: "Ảnh cưới",
  }),
  gift: Object.freeze({
    heading: "Hộp mừng cưới",
    intro: "Sự hiện diện của quý khách là món quà quý giá nhất. Nếu muốn gửi lời chúc mừng từ xa, xin vui lòng tham khảo thông tin dưới đây.",
    bankName: "Ngân hàng",
    accountName: "Chủ tài khoản",
    accountNumber: "Số tài khoản",
    qrAltPrefix: "Mã QR chuyển khoản",
    qrUnavailable: "Mã QR tạm thời chưa hiển thị",
  }),
  closing: Object.freeze({
    heading: "Lời cảm ơn",
    line: "Rất hân hạnh được đón tiếp",
  }),
  a11y: Object.freeze({
    coverImageAlt: "Ảnh cưới của",
    and: "và",
  }),
} as const);

export type ElegantEditorialV1Copy = typeof ELEGANT_EDITORIAL_V1_COPY;
