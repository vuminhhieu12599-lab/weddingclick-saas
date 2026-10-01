/**
 * Elegant Editorial v1 — fixed template-owned Vietnamese copy
 * (docs/DECISIONS.md "RF-06-0 First Production Renderer Contract
 * Clarification" P7, P10).
 *
 * Part of the immutable v1 renderer: never persisted customer content,
 * never read from the ViewModel, never templated with customer data. A copy
 * change after the RF-06F freeze is v2. Nothing here is a date, weekday,
 * lunar value, venue or name; those come only from canonical data.
 *
 * Every visible brand string maps to Design Baseline B6: exact Task029 copy
 * (A), frozen contract copy (B), a Design Baseline Dn ruling, or accessibility
 * copy (C). Section `heading` values are accessible names only (C): the
 * Design Baseline removes those headings visually (B5).
 */

export const ELEGANT_EDITORIAL_V1_COPY = Object.freeze({
  opening: Object.freeze({
    /** Task029 cover label (A). */
    label: "Thiệp Mời Cưới",
    /**
     * Two-line invitation block kicker (Product Owner ruling, Micro-Checkpoint
     * 10; supersedes the Design Baseline D1 one-line guest line). Never on the
     * opening.
     */
    salutation: "TRÂN TRỌNG KÍNH MỜI",
    /** Design Baseline D1: unpersonalized invitation, stands in for the absent guest overlay. */
    defaultGuest: "Quý khách",
    /** RF-06D: the envelope is the primary tap target; Task029 envelope accessible name (A). */
    openEnvelope: "Mở thiệp mời",
    /** RF-06D: Task029 hint under the envelope (A). */
    hint: "Chạm vào thiệp để mở",
  }),
  hero: Object.freeze({
    kicker: "Save the date",
  }),
  couple: Object.freeze({
    heading: "Cô dâu & Chú rể",
    /** Task029 two-line couple quote (A). */
    quote: Object.freeze(["Hôn nhân là chuyện cả đời.", "Yêu người vừa ý, cưới người mình thương."] as const),
    /** Task029 plate labels (A), chosen by the person's explicit `side`, never by position. */
    roleBySide: Object.freeze({ GROOM: "Chú Rể", BRIDE: "Cô Dâu" }),
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
    /** Task029 two-line intro (A). */
    intro: Object.freeze(["Đám cưới của chúng mình", "Sẽ diễn ra vào"] as const),
    monthPrefix: "Tháng",
    /** Monday → Sunday, matching the RF-05C Monday-first grid (K33). */
    weekdayHeaders: Object.freeze(["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const),
    ceremonyDayNote: "Ngày cưới",
  }),
  events: Object.freeze({
    heading: "Chương trình",
    mapLink: "Xem chỉ đường",
    /**
     * Product Owner ruling (Micro-Checkpoint 7A): visible ceremony-card title by
     * the card's side, whose rite is fixed (GROOM → Thành Hôn, BRIDE → Vu Quy;
     * RF2 "Ceremony-card presentation"). Template copy; never `event.title`.
     */
    ceremonyCardTitleBySide: Object.freeze({ GROOM: "Tiệc mừng lễ thành hôn", BRIDE: "Tiệc mừng lễ vu quy" }),
  }),
  loveStory: Object.freeze({
    heading: "Chuyện của chúng mình",
  }),
  photoStory: Object.freeze({
    /** Accessible name only; Task029 shows no visible Photo Story heading (C). */
    heading: "Khoảnh khắc của chúng mình",
    /** Photo alt prefix, then the 1-based position and the couple (C). */
    imageAlt: "Ảnh kỷ niệm",
  }),
  loveStoryPhoto: Object.freeze({
    /** Love Story background photo alt prefix, then the couple (C). */
    imageAlt: "Ảnh chuyện tình của",
  }),
  dressCode: Object.freeze({
    /** Task029 visible kicker (A). */
    heading: "Dress code",
    /** Accessible name of the swatch list (C); each swatch is announced by its hex value. */
    swatchesLabel: "Bảng màu gợi ý",
  }),
  timeline: Object.freeze({
    /** Accessible name only; Task029 shows no visible Timeline heading (C). */
    heading: "Lịch trình",
  }),
  gallery: Object.freeze({
    heading: "Album ảnh cưới",
    unavailable: "Ảnh tạm thời chưa hiển thị",
    imageAlt: "Ảnh cưới",
  }),
  gift: Object.freeze({
    heading: "Hộp mừng cưới",
    /** Gift note (Product Owner exact copy, Micro-Checkpoint 10). */
    intro: "Sự hiện diện của bạn là món quà quý giá nhất. Nếu muốn gửi quà chúc mừng, gia đình xin phép nhận tại đây.",
    bankName: "Ngân hàng",
    accountName: "Chủ tài khoản",
    accountNumber: "Số tài khoản",
    qrAltPrefix: "Mã QR chuyển khoản",
    qrUnavailable: "Mã QR tạm thời chưa hiển thị",
    /** RF-06D: Task029 CTA (A), also the Task029 dialog accessible name. */
    openDialog: "Gửi quà cưới",
    /** RF-06D: Task029 close control accessible name (A); the visible glyph is ✕. */
    closeDialog: "Đóng",
    /** RF-06D copy control (Task029 "Sao chép" / "Đã sao chép", A): shown only with a clipboard capability. */
    copyAccountNumber: "Sao chép",
    copyAccountNumberTarget: "số tài khoản",
    /** Shown only after a resolved `SUCCESS` (P34). */
    copySucceeded: "Đã sao chép",
    copyFailed: "Chưa sao chép được, vui lòng thử lại",
    copyUnavailable: "Trình duyệt chưa hỗ trợ sao chép tự động, vui lòng sao chép thủ công",
  }),
  countdown: Object.freeze({
    /** Task029 countdown kicker (A; Design Baseline B6). */
    heading: "Đếm ngược",
    /** Fixed unit labels for the RF-05C 24-hour-day parts. */
    units: Object.freeze({ days: "Ngày", hours: "Giờ", minutes: "Phút", seconds: "Giây" }),
    /** Design Baseline D7: shown once the ceremony start has been reached (`hasPassed`); never negative values. */
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
    /** Task029 two-line heading (A); the "&" before the second line is template glyph. */
    heading: "Xác nhận tham dự",
    headingSecondLine: "Gửi lời chúc",
    /** Task029 select label (A). */
    attendanceLabel: "Bạn có thể tham dự không?",
    /** Exactly the three canonical choices in order (RSVP completion amendment), Task029 wording (A). */
    attendanceLabels: Object.freeze({
      ATTENDING: "Sẽ tham dự",
      MAYBE: "Sẽ cố gắng tham dự",
      NOT_ATTENDING: "Tiếc quá, không tham dự được",
    }),
    /** The always-visible response-name input (Product Owner ruling): accessible name and placeholder. */
    guestNameLabel: "Tên bạn là gì?",
    guestNamePlaceholder: "Tên bạn là gì?",
    /** Design Baseline D10. */
    partySizeLabel: "Số người tham dự",
    /** Accessible name of the message textarea (C); Task029 placeholder (A). */
    messageLabel: "Lời nhắn (không bắt buộc)",
    messagePlaceholder: "Gửi lời chúc đến cô dâu & chú rể…",
    messageLimitPrefix: "Tối đa",
    messageLimitSuffix: "ký tự",
    /** Task029 submit (A); pending state (C). */
    submit: "Gửi lời chúc",
    submitting: "Đang gửi…",
    /**
     * Design Baseline D11 success wording (Task029, A), composed around the
     * presentation-only name: "Cảm ơn {name} đã phản hồi — rất mong được đón
     * tiếp!" / "Cảm ơn {name} đã phản hồi!". Shown only after `SUCCESS`.
     */
    success: Object.freeze({
      thanks: "Cảm ơn",
      responded: "đã phản hồi",
      attendingTail: "— rất mong được đón tiếp!",
      notAttendingTail: "!",
    }),
    /** Design Baseline D11 local edit action. */
    edit: "Sửa lại",
    errors: Object.freeze({
      attendanceRequired: "Vui lòng chọn tham dự hoặc không tham dự.",
      guestNameRequired: "Vui lòng nhập tên của bạn.",
      partySizeRange: "Số người tham dự chưa hợp lệ.",
      messageTooLong: "Lời nhắn quá dài.",
      inputRejected: "Thông tin chưa hợp lệ, vui lòng kiểm tra lại.",
    }),
    /** Non-success results (C): truthful state only; success uses `success` above. */
    results: Object.freeze({
      INVALID: "Thông tin chưa hợp lệ, vui lòng kiểm tra lại.",
      UNAVAILABLE: "Hiện chưa thể gửi xác nhận tham dự. Vui lòng thử lại sau.",
      FAILED: "Gửi xác nhận chưa thành công. Vui lòng thử lại.",
    }),
  }),
  closing: Object.freeze({
    heading: "Lời cảm ơn",
    /** Task029 closing copy (A), one flowing paragraph with no forced line breaks (B5 item 17). */
    line: "Sự hiện diện của bạn là niềm hạnh phúc trọn vẹn nhất trong ngày cưới của chúng tôi. Xin chân thành cảm ơn.",
  }),
  a11y: Object.freeze({
    coverImageAlt: "Ảnh cưới của",
    /** Couple portrait alt prefix by explicit side, then the display name: "Ảnh chân dung chú rể Minh Khôi" (C). */
    portraitImageAltBySide: Object.freeze({ GROOM: "Ảnh chân dung chú rể", BRIDE: "Ảnh chân dung cô dâu" }),
    and: "và",
  }),
} as const);

export type ElegantEditorialV1Copy = typeof ELEGANT_EDITORIAL_V1_COPY;
