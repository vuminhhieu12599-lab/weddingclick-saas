/**
 * Vietnamese Heritage v1 — fixed template-owned Vietnamese copy
 * (docs/DECISIONS.md "VH-01 …" mapping, class B; "VH-02A …" rulings D3–D5).
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
    /** The Song Hỷ mark's accessible name. */
    songHy: "Song Hỷ",
  }),
  opening: Object.freeze({
    /** Task 029 cover title. */
    label: "Thiệp Mời Cưới",
    /** Task 029 cover hint, also the opening button's accessible name (VH-02B-M1). */
    hint: "Chạm để mở thiệp",
  }),
  hero: Object.freeze({
    /** Hero photo alt prefix, followed by the couple. */
    photoAlt: "Ảnh cưới",
  }),
  ceremonial: Object.freeze({
    heading: "Gia đình hai bên",
    /** Family column labels, chosen by the family's explicit `side`, never by position. */
    labelBySide: Object.freeze({ GROOM: "Nhà Trai", BRIDE: "Nhà Gái" }),
    /**
     * Portrait-cluster alt prefix, followed by the 1-based slot position.
     * Positions are layout only, never groom / couple / bride.
     */
    portraitAlt: "Ảnh cưới, khung",
    /** Task 029 salutation line (VH-02A ruling D3). */
    salutation: "Trân Trọng Kính Mời",
    /** Unpersonalized guest line (VH-02A ruling D3); presentation only, never identity. */
    defaultGuest: "Bạn và Gia Đình",
    monthPrefix: "Tháng",
    /** Separate label placed beside the verbatim canonical lunar text; never concatenated into it. */
    lunarLabel: "Tức ngày",
  }),
  events: Object.freeze({
    heading: "Chương trình",
    /** Task 029 directions CTA, shown only for a canonical `event.mapUrl`. */
    mapLink: "Xem chỉ đường",
    /**
     * VH-02A ruling D4: visible card title by the ceremony card's explicit
     * side, whose rite is fixed (GROOM → Thành Hôn, BRIDE → Vu Quy; RF2
     * "Ceremony-card presentation"). Never parsed from or written to
     * `event.title` / `card.title`.
     */
    cardTitleBySide: Object.freeze({ GROOM: "Tiệc mừng lễ thành hôn", BRIDE: "Tiệc mừng lễ vu quy" }),
  }),
  timeline: Object.freeze({
    heading: "Lịch trình",
  }),
  countdown: Object.freeze({
    /** Accessible name only; Task 029 shows the four cells without a visible heading. */
    heading: "Đếm ngược đến lễ cưới",
    /** Task 029 unit labels. */
    units: Object.freeze({ days: "Ngày", hours: "Giờ", minutes: "Phút", seconds: "Giây" }),
  }),
  music: Object.freeze({
    /** Accessible name; the pressed state says whether it is playing. */
    toggle: "Nhạc nền",
    blocked: "Trình duyệt chưa cho phát nhạc. Chạm nút nhạc để thử lại.",
    error: "Chưa phát được nhạc nền.",
    commandFailed: "Chưa điều khiển được nhạc nền. Vui lòng thử lại.",
  }),
  loveStory: Object.freeze({
    eyebrow: "Love Story",
    heading: "Chuyện Chúng Mình",
    photoAlt: "Ảnh chuyện tình",
  }),
  rsvp: Object.freeze({
    /** Task 029 two-line title. */
    heading: "Xác Nhận Tham Dự",
    headingSecondLine: "& Gửi Lời Chúc",
    guestNameLabel: "Tên của bạn",
    guestNamePlaceholder: "Tên của bạn",
    attendanceLabel: "Bạn sẽ tham dự chứ?",
    /** Task 029 attendance wording, keyed by the frozen statuses. */
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
    /** Task 029 submit wording. */
    submit: "Gửi ngay",
    submitting: "Đang gửi…",
    /** Task 029 success line "Cảm ơn {tên}!" around the typed, presentation-only name. */
    successThanks: "Cảm ơn",
    edit: "Sửa lại",
    errors: Object.freeze({
      guestNameRequired: "Vui lòng nhập tên của bạn.",
      attendanceRequired: "Vui lòng chọn khả năng tham dự.",
      partySizeRange: "Số người tham dự từ 1 đến 20.",
      messageTooLong: "Lời chúc tối đa 500 ký tự.",
      inputRejected: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
    }),
    /** Honest non-success outcomes; the form stays editable for a retry. */
    results: Object.freeze({
      INVALID: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
      UNAVAILABLE: "Hiện chưa thể gửi xác nhận. Vui lòng thử lại sau.",
      FAILED: "Gửi chưa thành công. Vui lòng thử lại.",
    }),
  }),
  gift: Object.freeze({
    heading: "Gửi Quà Cưới",
    /** Product Owner ruling (VH-02B-E1): the visible CTA opening the gift details. */
    openDialog: "Gửi Quà Cưới",
    closeDialog: "Đóng",
    tabsLabel: "Chọn nhà",
    /** Task 029 gift intro note. */
    intro:
      "Sự hiện diện của bạn là món quà quý giá nhất. Nếu muốn gửi lời chúc mừng, gia đình xin phép nhận tại đây.",
    bankName: "Ngân hàng",
    accountName: "Chủ tài khoản",
    accountNumber: "Số tài khoản",
    qrAlt: "Mã QR chuyển khoản",
    /** Task 029 copy control wording. */
    copy: "Sao chép",
    copied: "Đã sao chép",
    copyTarget: "số tài khoản",
    copyUnavailable: "Thiết bị chưa hỗ trợ sao chép. Vui lòng chép thủ công.",
    copyFailed: "Sao chép chưa thành công. Vui lòng thử lại.",
  }),
  dressCode: Object.freeze({
    heading: "Dress Code",
    swatchLabel: "Màu gợi ý",
  }),
  gallery: Object.freeze({
    eyebrow: "Album ảnh cưới",
    heading: "Khoảnh Khắc Của Chúng Mình",
    imageAlt: "Ảnh cưới",
    unavailable: "Ảnh hiện chưa khả dụng",
    /** VH-02B-M2 lightbox: "Xem ảnh cưới {slot position}" on each resolved print. */
    open: "Xem ảnh cưới",
    viewerLabel: "Album ảnh cưới",
    close: "Đóng album ảnh",
    previous: "Ảnh trước",
    next: "Ảnh tiếp theo",
  }),
  closing: Object.freeze({
    heading: "Lời cảm ơn",
    /** VH-02A ruling D5: exact approved closing wording, three lines. */
    message: Object.freeze([
      "Sự hiện diện của bạn là niềm hạnh phúc trọn vẹn",
      "nhất trong ngày cưới của chúng tôi.",
      "Xin chân thành cảm ơn.",
    ] as const),
  }),
});
