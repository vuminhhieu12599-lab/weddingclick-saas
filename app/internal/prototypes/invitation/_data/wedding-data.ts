import type { DressCodeSwatch, PrototypeWeddingData } from "../_shared/types";

// Dress-code colours, defined once; `palette` below is derived from these.
const DRESS_CODE_SWATCHES: DressCodeSwatch[] = [
  { label: "Vàng bò", color: "#caa06a" },
  { label: "Nâu ấm", color: "#7c5c42" },
  { label: "Be nhạt", color: "#e8dcc8" },
  { label: "Nâu trầm", color: "#3d352b" },
];

/**
 * ONE shared fictional dataset reused by all three prototype directions
 * (CLAUDE-issued checkpoint §7) so visual differences are the only variable.
 * Fictional names/venue/bank details only — never real customer data.
 *
 * `groom`/`bride` hold each side's own operational data (reception time,
 * venue, directions, gift) so COMMON can show both independently while
 * GROOM/BRIDE show one side only, per the checkpoint's variant rules.
 * `ceremonyDateTimeIso` is the single canonical rite instant shared by
 * everyone — never side-scoped (CLAUDE.md §7).
 */
export const PROTOTYPE_WEDDING_DATA: PrototypeWeddingData = {
  groom: {
    personName: "Hoàng Nam",
    familyName: "Gia đình nhà trai",
    sideLabel: "Nhà Trai",
    fatherName: "Ông Hoàng Văn Thành",
    motherName: "Bà Nguyễn Thị Lệ",
    familyAddress: "Số 14 Đường Trần Phú, Quận Hải Châu, Đà Nẵng",
    familyLocationLabel: "TP. Đà Nẵng",
    receptionDateTimeIso: "2026-10-18T11:00:00+07:00",
    venueName: "Sảnh Tiệc Hoa Lan, Trung tâm Hội nghị An Viên",
    venueAddress: "Số 8 Đường Ánh Dương, Quận Hải Châu, Đà Nẵng",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=S%E1%BB%91%208%20%C4%90%C6%B0%E1%BB%9Dng%20%C3%81nh%20D%C6%B0%C6%A1ng%2C%20H%E1%BA%A3i%20Ch%C3%A2u%2C%20%C4%90%C3%A0%20N%E1%BA%B5ng",
    gift: {
      bankName: "Ngân hàng Á Châu (ACB)",
      accountHolder: "HOANG VAN NAM",
      accountNumber: "0123456789",
    },
  },
  bride: {
    personName: "Minh Anh",
    familyName: "Gia đình nhà gái",
    sideLabel: "Nhà Gái",
    fatherName: "Ông Trần Văn Hùng",
    motherName: "Bà Lê Thị Hoa",
    familyAddress: "Số 27 Đường Lê Duẩn, Quận Thanh Khê, Đà Nẵng",
    familyLocationLabel: "TP. Đà Nẵng",
    receptionDateTimeIso: "2026-10-18T17:30:00+07:00",
    venueName: "Nhà Hàng Sông Trăng",
    venueAddress: "Số 22 Đường Bạch Đằng, Quận Hải Châu, Đà Nẵng",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=S%E1%BB%91%2022%20B%E1%BA%A1ch%20%C4%90%E1%BA%B1ng%2C%20H%E1%BA%A3i%20Ch%C3%A2u%2C%20%C4%90%C3%A0%20N%E1%BA%B5ng",
    gift: {
      bankName: "Vietcombank",
      accountHolder: "TRAN THI MINH ANH",
      accountNumber: "0987654321",
    },
  },
  // 18.10.2026, 09:00, Asia/Ho_Chi_Minh — single canonical value every
  // ceremony/countdown display field is derived from (CLAUDE.md §7).
  ceremonyDateTimeIso: "2026-10-18T09:00:00+07:00",
  // Fictional prototype-only companion label — not derived from the ISO
  // value above (see types.ts note on ceremonyLunarDateLabel).
  ceremonyLunarDateLabel: "08/09 Âm Lịch",
  timeZone: "Asia/Ho_Chi_Minh",
  loveStory:
    "Từ một buổi chiều mưa tình cờ gặp nhau ở quán cà phê nhỏ, đến hôm nay, chúng tôi quyết định nắm tay nhau đi hết quãng đường còn lại. Cảm ơn vì đã luôn ở bên.",
  loveStoryShort:
    "Mỗi câu chuyện tình yêu đều có một hành trình riêng. Sau những ngày tháng cùng nhau trưởng thành, chúng tôi quyết định về chung một nhà và viết tiếp câu chuyện ấy bằng yêu thương.",
  loveStoryHeading: "Chuyện Chúng Mình",
  // Fictional prototype story; description/image optional per milestone.
  loveStoryMilestones: [
    {
      dateLabel: "2023",
      title: "Lần đầu gặp gỡ",
      description: "Một chiều mưa, hai người lạ ngồi chung một bàn.",
      imageUrl: "/prototypes/invitation/demo/pair-left.svg",
    },
    {
      dateLabel: "2024",
      title: "Ngày đầu hẹn hò",
      description: "Dạo bên sông Hàn, nói mãi không hết chuyện.",
      imageUrl: "/prototypes/invitation/demo/tall-portrait.svg",
    },
    {
      dateLabel: "2025",
      title: "Lời cầu hôn",
      description: "Hoàng hôn Sơn Trà, anh hỏi, em gật đầu.",
      imageUrl: "/prototypes/invitation/demo/gallery-03.svg",
    },
    {
      dateLabel: "2026",
      title: "Mình về chung một nhà",
      description: "Chọn nhau, hôm nay và mãi về sau.",
      imageUrl: "/prototypes/invitation/demo/pair-right.svg",
    },
  ],
  loveStoryBackgroundUrl: "/prototypes/invitation/demo/love-story.svg",
  timeline: [
    { dateTimeIso: "2026-10-18T08:30:00+07:00", label: "Đón khách" },
    { dateTimeIso: "2026-10-18T09:00:00+07:00", label: "Làm lễ" },
    { dateTimeIso: "2026-10-18T11:00:00+07:00", label: "Khai tiệc" },
  ],
  dressCode: {
    description:
      "Tông màu ấm, trang trọng và thoải mái vận động. Gia đình xin phép được ưu tiên các gam màu dưới đây, tránh sắc trắng/ngà dành riêng cho cô dâu.",
    swatches: DRESS_CODE_SWATCHES,
    palette: DRESS_CODE_SWATCHES.map((swatch) => swatch.color),
  },
  albumHeading: "Khoảnh Khắc Của Chúng Mình",
  // Demo album in upload order, mixed orientations; the template assigns
  // photos to its slots by orientation (derived from width/height).
  album: [
    {
      src: "/prototypes/invitation/demo/gallery-01.svg",
      alt: "Ảnh cưới 1",
      width: 600,
      height: 800,
      // Keep the upper-middle (faces) in view when cropped.
      focalPoint: { x: 0.5, y: 0.3 },
    },
    { src: "/prototypes/invitation/demo/gallery-02.svg", alt: "Ảnh cưới 2", width: 800, height: 600 },
    { src: "/prototypes/invitation/demo/gallery-03.svg", alt: "Ảnh cưới 3", width: 700, height: 700 },
    { src: "/prototypes/invitation/demo/gallery-04.svg", alt: "Ảnh cưới 4", width: 600, height: 800 },
    { src: "/prototypes/invitation/demo/gallery-05.svg", alt: "Ảnh cưới 5", width: 600, height: 800 },
    { src: "/prototypes/invitation/demo/gallery-06.svg", alt: "Ảnh cưới 6", width: 800, height: 600 },
    { src: "/prototypes/invitation/demo/gallery-07.svg", alt: "Ảnh cưới 7", width: 700, height: 700 },
    { src: "/prototypes/invitation/demo/gallery-08.svg", alt: "Ảnh cưới 8", width: 700, height: 700 },
    { src: "/prototypes/invitation/demo/gallery-09.svg", alt: "Ảnh cưới 9", width: 600, height: 800 },
    { src: "/prototypes/invitation/demo/gallery-10.svg", alt: "Ảnh cưới 10", width: 600, height: 800 },
  ],
  // Line breaks are editable wording; layouts that ignore them see one sentence.
  closingMessage:
    "Sự hiện diện của bạn là niềm hạnh phúc trọn vẹn\nnhất trong ngày cưới của chúng tôi.\nXin chân thành cảm ơn.",
  closingPhotoUrl: "/prototypes/invitation/demo/gallery-06.svg",
  giftIntroNote:
    "Sự hiện diện của bạn là món quà quý giá nhất. Nếu muốn gửi lời chúc mừng, gia đình xin phép nhận tại đây.",
  giftIntroNoteExtended:
    "Sự hiện diện của bạn là món quà quý giá nhất. Nếu không thể tham dự và muốn gửi quà chúc mừng, gia đình xin phép nhận tại đây.",
  // Region/customer-editable wording (checkpoint V5 §B4) — never hard-fixed
  // in component logic. {guest} and {ceremonyTitle} are substituted by
  // buildInvitationMessage(); ceremonyTitle always comes from the variant
  // resolver so COMMON/GROOM/BRIDE wording stays correct even though this
  // sentence itself is freely editable.
  invitationWording: {
    // Shortened for cleaner wrapping across templates (checkpoint V9 §3) —
    // still {guest}/{ceremonyTitle} token-driven and fully editable.
    template: "Trân trọng kính mời {guest} đến chung vui cùng gia đình chúng tôi.",
    // Split-line form used by stationery-style templates — same editable
    // wording, just not a single sentence.
    salutation: "Trân Trọng Kính Mời",
    defaultGuestLabel: "Bạn và Gia Đình",
  },
  // Product direction only (checkpoint V5 §B10) — chosen independently from
  // the in-invitation Hero photo, not implemented as real OG/meta here.
  shareCover: {
    imageLabel: "Ảnh cưới sân vườn hoàng hôn",
    note: "Ảnh preview khi chia sẻ link qua Zalo/Facebook — chọn riêng, độc lập với ảnh Hero trong thiệp.",
  },
  // Product direction only (checkpoint V5 §B9) — no real audio asset here.
  music: {
    trackLabel: "A Thousand Years (Piano Version)",
  },
};
