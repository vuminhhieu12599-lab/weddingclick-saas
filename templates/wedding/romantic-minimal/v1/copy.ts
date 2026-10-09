/**
 * Romantic Minimal v1 — fixed template-owned Vietnamese/English copy from the
 * approved Task 029 direction (docs/DECISIONS.md "RM-02").
 *
 * Part of the immutable v1 renderer: never customer content, never read from
 * the ViewModel. Nothing here is a date, weekday, lunar value, venue or name;
 * those come only from canonical data.
 */

export const ROMANTIC_MINIMAL_V1_COPY = Object.freeze({
  a11y: Object.freeze({
    and: "và",
  }),
  opening: Object.freeze({
    invite: "Thân Mời",
    open: "Mở thiệp",
  }),
  saveTheDate: Object.freeze({
    kicker: "Save the date",
    photoAlt: "Ảnh cưới",
  }),
  identity: Object.freeze({
    heading: "Gia đình hai bên",
    /** Family / reception side labels, chosen by the explicit `side`, never by position. */
    labelBySide: Object.freeze({ GROOM: "Nhà Trai", BRIDE: "Nhà Gái" }),
  }),
  justMarried: Object.freeze({
    script: "Just",
    serif: "Married",
  }),
  invite: Object.freeze({
    salutation: "Trân Trọng Kính Mời",
    /** Unpersonalized guest line (Task 029 Romantic Minimal); presentation only, never identity. */
    defaultGuest: "Quý Khách",
  }),
  ceremony: Object.freeze({
    monthPrefix: "Tháng",
    /** Separate label before the verbatim canonical lunar text; never concatenated into it. */
    lunarLabel: "Tức ngày",
  }),
  countdown: Object.freeze({
    heading: "Đếm ngược tới ngày chung đôi",
    units: Object.freeze({ days: "Ngày", hours: "Giờ", minutes: "Phút", seconds: "Giây" }),
  }),
  reception: Object.freeze({
    heading: "Tiệc cưới",
    /** Task 029 subtitle by the ceremony card's explicit side (its rite). */
    titleBySide: Object.freeze({ GROOM: "Tiệc mừng Lễ Thành Hôn", BRIDE: "Tiệc mừng Lễ Vu Quy" }),
    mapLink: "Xem chỉ đường",
  }),
  timeline: Object.freeze({
    heading: "Lịch trình",
  }),
  ourLove: Object.freeze({
    heading: "Our Love",
    photoAlt: "Ảnh chuyện tình, khung",
    open: "Xem ảnh",
    close: "Đóng",
  }),
  calendar: Object.freeze({
    intro: Object.freeze(["Đám cưới của chúng mình", "sẽ diễn ra vào"] as const),
    monthPrefix: "Tháng",
    yearPrefix: "năm",
    /** Sunday-first header, matching the Task 029 grid. */
    weekdays: Object.freeze(["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const),
    weddingDay: "Ngày cưới",
  }),
  music: Object.freeze({
    toggle: "Nhạc nền",
    blocked: "Trình duyệt chưa cho phát nhạc. Chạm nút nhạc để thử lại.",
    error: "Chưa phát được nhạc nền.",
    commandFailed: "Chưa điều khiển được nhạc nền. Vui lòng thử lại.",
  }),
  rsvp: Object.freeze({
    heading: "Xác Nhận Tham Dự",
    headingSecondLine: "Gửi Lời Chúc",
    guestNameLabel: "Tên của bạn",
    guestNamePlaceholder: "Tên của bạn",
    attendanceLabel: "Bạn sẽ tham dự chứ?",
    attendanceLabels: Object.freeze({
      ATTENDING: "Sẽ tham dự",
      MAYBE: "Sẽ cố gắng tham dự",
      NOT_ATTENDING: "Tiếc quá, không tham dự được",
    }),
    partySizeLabel: "Số người tham dự",
    messageLabel: "Lời chúc",
    messagePlaceholder: "Gửi lời chúc đến cô dâu & chú rể...",
    messageLimitPrefix: "Tối đa",
    messageLimitSuffix: "ký tự",
    submit: "Gửi ngay",
    submitting: "Đang gửi…",
    successThanks: "Cảm ơn",
    edit: "Sửa lại",
    errors: Object.freeze({
      guestNameRequired: "Vui lòng nhập tên của bạn.",
      attendanceRequired: "Vui lòng chọn khả năng tham dự.",
      partySizeRange: "Số người tham dự từ 1 đến 20.",
      messageTooLong: "Lời chúc tối đa 500 ký tự.",
      inputRejected: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
    }),
    results: Object.freeze({
      INVALID: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
      UNAVAILABLE: "Hiện chưa thể gửi xác nhận. Vui lòng thử lại sau.",
      FAILED: "Gửi chưa thành công. Vui lòng thử lại.",
    }),
  }),
  gift: Object.freeze({
    heading: "Gửi Mừng Cưới",
    /** Task 029 Romantic Minimal gift note. */
    intro:
      "Sự hiện diện của bạn là món quà quý giá nhất. Nếu không thể tham dự và muốn gửi quà chúc mừng, gia đình xin phép nhận tại đây.",
    openDialog: "Gửi mừng cưới",
    closeDialog: "Đóng",
    tabsLabel: "Chọn nhà",
    bankName: "Ngân hàng",
    accountName: "Chủ tài khoản",
    accountNumber: "Số tài khoản",
    qrAlt: "Mã QR chuyển khoản",
    copy: "Sao chép",
    copied: "Đã sao chép",
    copyTarget: "số tài khoản",
    copyUnavailable: "Thiết bị chưa hỗ trợ sao chép. Vui lòng chép thủ công.",
    copyFailed: "Sao chép chưa thành công. Vui lòng thử lại.",
  }),
  album: Object.freeze({
    heading: "Wedding Album",
    imageAlt: "Ảnh cưới",
    unavailable: "Ảnh hiện chưa khả dụng",
    open: "Xem ảnh",
    viewerLabel: "Album ảnh",
    close: "Đóng",
    previous: "Ảnh trước",
    next: "Ảnh sau",
  }),
  thankYou: Object.freeze({
    heading: "Thank you",
    photoAlt: "Ảnh cưới",
  }),
});
