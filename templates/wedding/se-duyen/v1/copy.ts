/**
 * Se Duyên v1 — fixed template copy (SD-V1-01).
 *
 * The approved pilot v03 wording, carried over verbatim. Template copy only:
 * no customer data, no wedding fact, no name, date, time, place or amount.
 * Everything a guest reads that belongs to the Project comes from the
 * ViewModel.
 *
 * Three strings are fixed here that the prototype read from its own demo
 * dataset, because the production Snapshot has no field for them:
 * `invitation.salutation`, `invitation.defaultGuest` and `closing.message`.
 * They use the same wording as Our Wedding Story v1/v2, so the three
 * templates speak with one voice. Making them customer-editable means new
 * canonical content fields and is a scoped product decision, not a renderer
 * change (see the note in `sections/invitation.tsx`).
 *
 * `sideLabel` is the only wording for a family side: the family's own names
 * are printed directly beneath "Nhà Trai" / "Nhà Gái". The collective
 * "Song thân" is deliberately absent and must not be reintroduced
 * (Product Owner rule).
 */
export const SE_DUYEN_V1_COPY = Object.freeze({
  /** The two houses, by the card's own explicit side; never by position. */
  sideLabel: Object.freeze({ GROOM: "Nhà Trai", BRIDE: "Nhà Gái" }),
  /** Roles on the couple page, by explicit side. */
  roleLabel: Object.freeze({ GROOM: "Chú Rể", BRIDE: "Cô Dâu" }),
  cover: Object.freeze({
    eyebrow: "Thiệp Cưới",
    /** The accessible name of the box: the box itself is the control. */
    openHint: "Chạm vào hộp để nhận thiệp",
  }),
  hero: Object.freeze({
    eyebrow: "Se Duyên",
    /** Alt text pattern completed with the couple's own names at render time. */
    photoAltPrefix: "Ảnh cưới của",
  }),
  invitation: Object.freeze({
    salutation: "Trân Trọng Kính Mời",
    /** Unpersonalized guest line; presentation only, never identity. */
    defaultGuest: "Bạn và Gia Đình",
    /** Prefix of the static lunar companion line; never presented as computed. */
    lunarPrefix: "Tức ngày",
  }),
  couple: Object.freeze({
    eyebrow: "Uyên Ương",
  }),
  families: Object.freeze({
    eyebrow: "Trăm Năm Gắn Kết",
    heading: "Hai Bên Gia Đình",
  }),
  ceremony: Object.freeze({
    eyebrow: "Hôn Lễ",
    monthPrefix: "Tháng",
    venueLabel: "Tại",
    /** The rite is held at the hosting family's home. */
    homePrefix: "Tư gia",
    directions: "Xem chỉ đường",
    directionsTo: "Xem chỉ đường —",
  }),
  timeline: Object.freeze({
    eyebrow: "Trình Tự Ngày Vui",
    heading: "Lịch Trình Hôn Lễ",
  }),
  music: Object.freeze({
    play: "Bật nhạc nền",
    pause: "Tắt nhạc nền",
    /** Said only after an explicit tap, never on its own. */
    failed: "Không phát được nhạc",
  }),
  countdown: Object.freeze({
    heading: "Chờ Ngày Se Duyên",
    /** Shown instead of the dials once the canonical instant has been reached. */
    arrived: "Ngày Vui Đã Đến",
    /** Accessible name of the live region. */
    label: "Thời gian còn lại đến ngày cưới",
    units: Object.freeze({ days: "Ngày", hours: "Giờ", minutes: "Phút", seconds: "Giây" }),
  }),
  gallery: Object.freeze({
    eyebrow: "Album Cưới",
    heading: "Khoảnh Khắc Của Chúng Mình",
    /** Accessible name of a frame, completed with its position at render time. */
    open: "Xem ảnh lớn",
    /** Alt text pattern, completed with the photograph's position. */
    imageAlt: "Ảnh cưới",
    of: "trên",
    viewerLabel: "Ảnh cưới phóng to",
    close: "Đóng",
    previous: "Ảnh trước",
    next: "Ảnh tiếp theo",
  }),
  gift: Object.freeze({
    eyebrow: "Tấm Lòng",
    heading: "Mừng Cưới",
    note: "Sự hiện diện của quý vị đã là món quà quý nhất. Nếu quý vị ở xa và muốn gửi lời chúc, xin dùng thông tin dưới đây.",
    openHint: "Chạm vào phong bì",
    closeHint: "Gấp phong bì lại",
    sideLegend: "Chọn nhà",
    bankLabel: "Ngân hàng",
    holderLabel: "Chủ tài khoản",
    accountLabel: "Số tài khoản",
    /** Accessible name of the copy control, completed with the family. */
    copyLabel: "Sao chép số tài khoản",
    copyDone: "Đã sao chép",
    copyFailed: "Không sao chép được",
    copyUnavailable: "Thiết bị không cho sao chép",
    /** Alt text of a side's own transfer QR, completed with the family. */
    qrAlt: "Mã QR chuyển khoản",
  }),
  closing: Object.freeze({
    eyebrow: "Lời Cảm Ơn",
    message: "Sự hiện diện của quý vị là niềm vinh hạnh cho gia đình chúng tôi.",
  }),
});
