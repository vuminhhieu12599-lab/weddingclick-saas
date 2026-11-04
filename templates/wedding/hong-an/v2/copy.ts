/**
 * Hồng Ân v2 — the template's one copy module (HA-CONTENT-01).
 *
 * Every fixed string the renderer draws lives here: nothing is typed into a
 * component, and nothing here is customer data. Customer values (names,
 * dates, venues, parents, the invitation wording, the love story, the
 * timeline, the gift details) arrive through the ViewModel and are never
 * defaulted, completed or invented from this file.
 *
 * The Scripture below is the approved template copy (Product Owner, V4
 * handoff), unchanged from v1. In v2 it is the DEFAULT rather than the only
 * possible verse: a Project may configure its own through the two
 * `designSettings` keys `wedding.hong-an.v2` declares, and
 * `sections/scripture-quote.ts` is the one place that choice is resolved.
 * This file stays the fallback, so a Project that configures nothing renders
 * exactly what v1 renders.
 */
export const HONG_AN_V2_COPY = {
  /** Template identity. Deliberately small on the cover and nowhere else. */
  brand: "Hồng Ân",
  eyebrow: "Bí tích Hôn phối",

  opening: {
    openLabel: "MỞ THIỆP CƯỚI",
    /** Described, not decorative: the photograph is the subject of the card. */
    photoAltPrefix: "Ảnh cưới của",
  },

  hero: {
    scrollHint: "Cuộn xuống để xem thiệp",
  },

  countdown: {
    heading: "Chờ Ngày Hồng Ân",
    label: "Thời gian còn lại đến ngày cưới",
    arrived: "Ngày Hồng Ân đã đến",
    units: { days: "Ngày", hours: "Giờ", minutes: "Phút", seconds: "Giây" },
  },

  invitation: {
    /**
     * The four lines of the approved composition read as ONE sentence:
     *
     *   TRONG HỒNG ÂN THIÊN CHÚA      (kicker)
     *   Trân Trọng Kính Mời           (heading)
     *   Anh Tuấn và gia đình          (the guest, from the overlay)
     *   đến hiệp lời cầu nguyện …     (the body)
     *
     * The kicker and the heading are template-owned for V1; the body is
     * the part a Project configures.
     */
    kicker: "Trong Hồng Ân Thiên Chúa",
    heading: "Trân Trọng Kính Mời",
    /**
     * Shown only when the Project has configured no invitation wording of
     * its own. A configured message always wins and is rendered exactly
     * as authored; this is template wording, never a guest's name and
     * never a stand-in for missing customer data.
     *
     * It is deliberately the CONTINUATION of the heading rather than a
     * sentence of its own, so the composition reads "Trân trọng kính mời
     * [guest] đến hiệp lời cầu nguyện…" and the invitation phrase is
     * never said twice.
     */
    fallbackMessage: "đến hiệp lời cầu nguyện và chung vui trong ngày Hôn phối của chúng con.",
  },

  families: {
    heading: "Gia Đình Hai Bên",
    groom: "Nhà Trai",
    bride: "Nhà Gái",
    father: "Ông",
    mother: "Bà",
  },

  ceremony: {
    /**
     * Used only where the Project's own event data establishes a Catholic
     * Mass. Otherwise the canonical rite title is shown unchanged — the
     * renderer never relabels an ordinary ceremony as a Mass.
     */
    massHeading: "Thánh Lễ Hôn Phối",
    /** Neutral heading above the per-side rite cards. */
    heading: "Nghi Lễ Hôn Phối",
    directions: "Xem bản đồ",
    at: "tại",
  },

  reception: {
    heading: "Tiệc Mừng Thành Hôn",
    directions: "Xem bản đồ",
  },

  loveStory: {
    heading: "Hành Trình Yêu Thương",
  },

  gallery: {
    heading: "Khoảnh Khắc",
    open: "Xem ảnh",
    close: "Đóng",
    previous: "Ảnh trước",
    next: "Ảnh sau",
    counter: (index: number, total: number) => `Ảnh ${String(index)} trên ${String(total)}`,
  },

  timeline: {
    heading: "Lịch Trình Hôn Lễ",
  },

  scripture: {
    heading: "Lời Chúa",
    /** Approved template copy — the DEFAULT verse when a Project configures none. */
    verse: "Điều gì Thiên Chúa đã liên kết thì con người không được phân ly.",
    /** The default verse's own reference. Never reused for a configured verse. */
    reference: "Mt 19,6",
  },

  rsvp: {
    heading: "Hồi Âm & Lời Chúc",
    intro: "Sự hiện diện của quý vị là món quà quý giá nhất với chúng con.",
    nameLabel: "Tên của bạn",
    namePlaceholder: "Tên hiển thị trong danh sách khách mời",
    attendanceLabel: "Bạn sẽ đến chứ?",
    attendance: {
      ATTENDING: "Sẽ tham dự",
      MAYBE: "Có thể tham dự",
      NOT_ATTENDING: "Không tham dự",
    },
    partySizeLabel: "Số người tham dự",
    messageLabel: "Lời chúc (không bắt buộc)",
    messagePlaceholder: "Gửi đôi lời chúc tới cô dâu chú rể…",
    submit: "Gửi hồi âm",
    submitting: "Đang gửi…",
    edit: "Sửa hồi âm",
    /** Neutral: a guest who declined must not read an attendance confirmation. */
    success: "Cảm ơn bạn đã gửi hồi âm",
    errors: {
      ATTENDANCE_REQUIRED: "Vui lòng chọn một lựa chọn tham dự.",
      GUEST_NAME_REQUIRED: "Vui lòng nhập tên của bạn.",
      PARTY_SIZE_RANGE: "Số người tham dự phải từ 1 đến 20.",
      MESSAGE_TOO_LONG: "Lời nhắn quá dài.",
      INPUT_REJECTED: "Thông tin chưa hợp lệ, vui lòng kiểm tra lại.",
    },
    results: {
      INVALID: "Thông tin chưa hợp lệ, vui lòng kiểm tra lại.",
      UNAVAILABLE: "Hiện chưa thể gửi hồi âm. Vui lòng thử lại sau.",
      FAILED: "Gửi hồi âm chưa thành công. Vui lòng thử lại.",
    },
  },

  gift: {
    heading: "Mừng Cưới",
    /** The wording the other production templates already use, verbatim. */
    intro:
      "Sự hiện diện của bạn là món quà quý giá nhất. Nếu không thể tham dự và muốn gửi quà chúc mừng, gia đình xin phép nhận tại đây.",
    /** The only gift control on the page; the details live in the dialog. */
    openDialog: "Gửi mừng cưới",
    closeDialog: "Đóng",
    dialogHeading: "Gửi Mừng Cưới",
    tabsLabel: "Chọn nhà trai hoặc nhà gái",
    sides: { GROOM: "Nhà Trai", BRIDE: "Nhà Gái" },
    rows: { bankName: "Ngân hàng", accountName: "Chủ tài khoản", accountNumber: "Số tài khoản" },
    copy: "Sao chép số tài khoản",
    copied: "Đã sao chép",
    copyFailed: "Chưa sao chép được",
    copyUnavailable: "Trình duyệt không hỗ trợ sao chép",
    qrAlt: (side: string) => `Mã QR chuyển khoản ${side}`,
    saveQr: "Lưu mã QR",
    qrSaved: "Đã lưu mã QR",
    qrSaveFailed: "Chưa lưu được mã QR",
    qrSaveUnavailable: "Trình duyệt không hỗ trợ tải tệp",
  },

  music: {
    play: "Bật nhạc nền",
    pause: "Tắt nhạc nền",
    blocked: "Trình duyệt đang chặn phát nhạc",
  },

  closing: {
    heading: "Lời Cảm Ơn",
    message:
      "Chúng con chân thành cảm ơn sự hiện diện, lời cầu nguyện và tình cảm yêu thương mà quý vị đã dành cho ngày trọng đại này.",
  },
} as const;
