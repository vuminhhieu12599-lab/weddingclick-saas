/**
 * Our Wedding Story v1 — fixed template-owned Vietnamese/English copy from
 * the approved Visual Freeze v1 (docs/DECISIONS.md "OWS-01").
 *
 * Part of the immutable v1 renderer: never customer content, never read from
 * the ViewModel. Nothing here is a date, weekday, lunar value, venue or name;
 * those come only from canonical data. Prototype-only review wording (the
 * "Bản xem thử" simulation notes) is not part of production.
 */

export const OUR_WEDDING_STORY_V1_COPY = Object.freeze({
  a11y: Object.freeze({
    and: "và",
  }),
  /** Labels chosen by the explicit `side`, never by position. */
  sideLabel: Object.freeze({ GROOM: "Nhà Trai", BRIDE: "Nhà Gái" }),
  cover: Object.freeze({
    label: "Bìa thiệp",
    mastheadKicker: "A Love Story",
    mastheadWord: "Our Wedding",
    mastheadScript: "Story",
    photoAlt: "Ảnh cưới",
    guestLabel: "Thân gửi",
    open: "Mở thiệp",
    scrollHint: "Cuộn xuống để đọc tiếp",
  }),
  music: Object.freeze({
    play: "Phát nhạc",
    pause: "Tạm dừng nhạc",
    failed: "Không phát được nhạc",
  }),
  families: Object.freeze({
    kicker: "Our Families",
    title: "Hai Gia Đình",
  }),
  couple: Object.freeze({
    kicker: "The Couple",
    storyTitle: "Chuyện Chúng Mình",
    /** Caption and name-block role by the explicit person side. */
    englishRole: Object.freeze({ GROOM: "The Groom", BRIDE: "The Bride" }),
    vietnameseRole: Object.freeze({ GROOM: "Chú rể", BRIDE: "Cô dâu" }),
  }),
  invitation: Object.freeze({
    kicker: "The Invitation",
    salutation: "Trân Trọng Kính Mời",
    /** Unpersonalized guest line; presentation only, never identity. */
    defaultGuest: "Bạn và Gia Đình",
    to: "tới dự",
    dateCaption: "Hôn lễ được cử hành vào lúc",
    monthPrefix: "Tháng",
    receptionsLabel: "Tiệc cưới",
    /** Reception subtitle by the ceremony card's explicit side (its rite). */
    receptionTitleBySide: Object.freeze({ GROOM: "Tiệc mừng Lễ Thành Hôn", BRIDE: "Tiệc mừng Lễ Vu Quy" }),
    directions: "Chỉ đường",
    directionsTo: "Chỉ đường tới",
  }),
  date: Object.freeze({
    kicker: "The Date",
    monthPrefix: "Tháng",
    yearPrefix: "năm",
    calendarLabelPrefix: "Lịch tháng",
    /** Sunday-first header, matching the approved grid. */
    weekdays: Object.freeze(["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const),
    countdownLabel: "Đếm ngược tới ngày cưới",
    units: Object.freeze({ days: "Ngày", hours: "Giờ", minutes: "Phút", seconds: "Giây" }),
    passed: "Ngày chung đôi đã đến",
  }),
  gallery: Object.freeze({
    kicker: "Our Gallery",
    title: "Khoảnh Khắc Của Chúng Mình",
    open: "Xem ảnh",
    of: "trên",
    imageAlt: "Ảnh cưới",
    unavailable: "Ảnh hiện chưa khả dụng",
    hint: "Chạm vào ảnh để xem toàn màn hình",
    viewerLabel: "Xem ảnh",
    close: "Đóng",
    previous: "Ảnh trước",
    next: "Ảnh sau",
  }),
  rsvpGift: Object.freeze({
    kickerBoth: "RSVP & Wedding Gift",
    kickerGiftOnly: "Wedding Gift",
    kickerRsvpOnly: "RSVP",
  }),
  rsvp: Object.freeze({
    title: "Xác nhận tham dự",
    intro: "Sự có mặt của bạn là niềm vui lớn của chúng mình.",
    guestNameLabel: "Tên của bạn",
    guestNamePlaceholder: "Ví dụ: Anh Hiếu và gia đình",
    attendanceLegend: "Bạn sẽ tham dự chứ?",
    attendanceLabels: Object.freeze({
      ATTENDING: "Sẽ tham dự",
      MAYBE: "Sẽ cố gắng tham dự",
      NOT_ATTENDING: "Tiếc quá, không tham dự được",
    }),
    partySizeLabel: "Số người tham dự",
    partySizeDecrease: "Bớt một người",
    partySizeIncrease: "Thêm một người",
    messageLabel: "Lời nhắn",
    messageOptional: "(không bắt buộc)",
    messagePlaceholder: "Gửi lời chúc tới cô dâu chú rể…",
    submit: "Gửi xác nhận",
    submitting: "Đang gửi…",
    doneTitle: "Đã ghi nhận phản hồi của bạn",
    summary: Object.freeze({ name: "Tên", attendance: "Phản hồi", partySize: "Số người", message: "Lời nhắn" }),
    edit: "Chỉnh sửa phản hồi",
    errors: Object.freeze({
      guestNameRequired: "Vui lòng nhập tên của bạn.",
      attendanceRequired: "Vui lòng chọn một lựa chọn.",
      partySizeRange: "Số người từ 1 đến 20.",
      messageTooLong: "Lời nhắn tối đa 500 ký tự.",
      inputRejected: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
    }),
    results: Object.freeze({
      INVALID: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
      UNAVAILABLE: "Hiện chưa thể gửi xác nhận. Vui lòng thử lại sau.",
      FAILED: "Gửi chưa thành công. Vui lòng thử lại.",
    }),
  }),
  gift: Object.freeze({
    /** Page note (the approved extended wording). */
    pageNote:
      "Sự hiện diện của bạn là món quà quý giá nhất. Nếu không thể tham dự và muốn gửi quà chúc mừng, gia đình xin phép nhận tại đây.",
    open: "Gửi quà mừng cưới",
    sheetKicker: "Wedding Gift",
    sheetTitle: "Hộp mừng cưới",
    /** Sheet note (the approved short wording). */
    sheetNote: "Sự hiện diện của bạn là món quà quý giá nhất. Nếu muốn gửi lời chúc mừng, gia đình xin phép nhận tại đây.",
    close: "Đóng",
    bankName: "Ngân hàng",
    accountName: "Chủ tài khoản",
    accountNumber: "Số tài khoản",
    qrAlt: "Mã QR chuyển khoản",
    copy: "Sao chép",
    copied: "Đã sao chép",
    copyTarget: "số tài khoản",
    copyUnavailable: "Thiết bị chưa hỗ trợ sao chép — vui lòng chép thủ công.",
    copyFailed: "Không sao chép được — vui lòng chép thủ công.",
  }),
  thankYou: Object.freeze({
    kicker: "Thank You",
    script: "Thank you",
    photoAlt: "Ảnh cưới",
    message: Object.freeze([
      "Sự hiện diện của bạn là niềm hạnh phúc trọn vẹn",
      "nhất trong ngày cưới của chúng tôi.",
      "Xin chân thành cảm ơn.",
    ] as const),
  }),
  footer: "Our Wedding Story",
});
