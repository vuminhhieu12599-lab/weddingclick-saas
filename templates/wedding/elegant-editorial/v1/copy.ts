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
    /** RF-06D: explicit open control (plays the finite envelope transition). */
    open: "Mở thiệp",
    /** RF-06D: explicit skip control (opens immediately, no transition). */
    skip: "Xem ngay",
    /** RF-06D: accessible name of the opening control group. */
    controlsLabel: "Mở thiệp mời",
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
    /** RF-06D gift dialog. */
    openDialog: "Xem thông tin mừng cưới",
    dialogTitle: "Thông tin mừng cưới",
    closeDialog: "Đóng",
    /** RF-06D copy control: shown only with a clipboard capability. */
    copyAccountNumber: "Sao chép",
    copyAccountNumberTarget: "số tài khoản",
    copyPending: "Đang sao chép…",
    copySucceeded: "Đã sao chép số tài khoản",
    copyFailed: "Chưa sao chép được, vui lòng thử lại",
    copyUnavailable: "Trình duyệt chưa hỗ trợ sao chép tự động, vui lòng sao chép thủ công",
  }),
  countdown: Object.freeze({
    heading: "Hẹn ngày chung vui",
    /** Fixed unit labels for the RF-05C 24-hour-day parts. */
    units: Object.freeze({ days: "Ngày", hours: "Giờ", minutes: "Phút", seconds: "Giây" }),
    /** Shown once the ceremony start has been reached (`hasPassed`); never negative values. */
    passed: "Ngày vui đã đến",
  }),
  music: Object.freeze({
    /** Toggle button name; the pressed state carries playing / not playing. */
    toggle: "Nhạc nền",
    blocked: "Trình duyệt đã chặn phát nhạc. Nhấn nút nhạc để thử lại.",
    error: "Không phát được nhạc. Nhấn nút nhạc để thử lại.",
    commandFailed: "Chưa điều khiển được nhạc, vui lòng thử lại.",
  }),
  rsvp: Object.freeze({
    heading: "Xác nhận tham dự",
    intro: "Xin vui lòng cho chúng mình biết bạn có thể đến chung vui hay không.",
    attendanceLegend: "Bạn sẽ tham dự chứ?",
    /** Exactly the two canonical choices (RF15, K15): no third option. */
    attendanceLabels: Object.freeze({ ATTENDING: "Tôi sẽ tham dự", NOT_ATTENDING: "Tôi không thể tham dự" }),
    guestNameLabel: "Tên của bạn",
    partySizeLabel: "Số người tham dự",
    messageLabel: "Lời nhắn (không bắt buộc)",
    messageLimitPrefix: "Tối đa",
    messageLimitSuffix: "ký tự",
    submit: "Gửi xác nhận",
    submitting: "Đang gửi…",
    errors: Object.freeze({
      attendanceRequired: "Vui lòng chọn tham dự hoặc không tham dự.",
      guestNameRequired: "Vui lòng nhập tên của bạn.",
      partySizeRange: "Số người tham dự chưa hợp lệ.",
      messageTooLong: "Lời nhắn quá dài.",
      inputRejected: "Thông tin chưa hợp lệ, vui lòng kiểm tra lại.",
    }),
    results: Object.freeze({
      SUCCESS: "Cảm ơn bạn! Xác nhận tham dự đã được ghi nhận.",
      INVALID: "Thông tin chưa hợp lệ, vui lòng kiểm tra lại.",
      UNAVAILABLE: "Hiện chưa thể gửi xác nhận tham dự. Vui lòng thử lại sau.",
      FAILED: "Gửi xác nhận chưa thành công. Vui lòng thử lại.",
    }),
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
