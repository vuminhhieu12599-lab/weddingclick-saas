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
    /** Task 029 cover hint; the tap target arrives with the VH-02B opening island. */
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
    eyebrow: "Album ảnh cưới",
    heading: "Khoảnh Khắc Của Chúng Mình",
    imageAlt: "Ảnh cưới",
    unavailable: "Ảnh hiện chưa khả dụng",
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
