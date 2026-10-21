import type { AlbumPhoto } from "../_shared/types";

/**
 * Prototype-only photo fixtures for the Se Duyên P0-2 supplied-photo path.
 *
 * The review harness otherwise never passes `projectPhotos`, so the branch
 * that switches a frame to `cover` plus the photo's own focal point could not
 * be seen at all. These feed that real path — the same `AlbumPhoto` shape and
 * the same shared `assignPhotosToSlots` production uses — instead of a manual
 * CSS override, which would prove nothing.
 *
 * Test fixtures, never customer content and never a production fallback
 * (docs/DECISIONS.md P7, M6–M10): the files are flat marked-up panels, not
 * photographs, so a crop or a gap inside a frame is visible at a glance.
 *
 * The order is chosen so the orientation-aware assignment fills all eight
 * Se Duyên frames and every ratio under test lands in one.
 */
const RATIO_TEST_DIR = "/prototypes/invitation/demo/_ratio-test";

export const RATIO_TEST_PHOTOS: AlbumPhoto[] = [
  // Off-centre focal points on two fixtures, so focal positioning is
  // observable rather than assumed.
  { src: `${RATIO_TEST_DIR}/f1-2x3.svg`, alt: "Fixture 2:3", width: 800, height: 1200, focalPoint: { x: 0.5, y: 0.15 } },
  { src: `${RATIO_TEST_DIR}/f2-3x4.svg`, alt: "Fixture 3:4", width: 900, height: 1200 },
  { src: `${RATIO_TEST_DIR}/f3-2x3.svg`, alt: "Fixture 2:3 (2)", width: 800, height: 1200 },
  { src: `${RATIO_TEST_DIR}/f4-1x1.svg`, alt: "Fixture 1:1", width: 1000, height: 1000 },
  { src: `${RATIO_TEST_DIR}/f5-1x1.svg`, alt: "Fixture 1:1 (2)", width: 1000, height: 1000 },
  { src: `${RATIO_TEST_DIR}/f6-4x3.svg`, alt: "Fixture 4:3", width: 1200, height: 900, focalPoint: { x: 0.15, y: 0.5 } },
  { src: `${RATIO_TEST_DIR}/f7-3x2.svg`, alt: "Fixture 3:2", width: 1200, height: 800 },
  { src: `${RATIO_TEST_DIR}/f8-16x9.svg`, alt: "Fixture 16:9", width: 1280, height: 720 },
];

/**
 * A real Project's own wedding photographs, for judging face crops and focal
 * positions — the SVG ratio panels above prove the geometry, not how a face
 * sits in a frame.
 *
 * These are the Product Owner-approved fictional showroom photographs already
 * in this repository (`public/showroom/demo/vietnamese-heritage/photos`,
 * commercial use approved 2026-10-01), referenced in place rather than
 * copied. They stand in for customer media; they are never a fallback and
 * never mixed with this direction's own demo art.
 *
 * Order is the upload order a customer would have, and matches the frames
 * Se Duyên fills first: the four áo dài photographs this direction's art
 * direction accepts (01, 02, 10, 03 — see the interior README) lead, so a
 * short set fills the opening, couple and closing with them. The last four
 * only exist to exercise an eight-photo album; 05/09 carry a 囍 glyph and
 * 04/07 a tuxedo, which Se Duyên's own gallery excludes.
 */
const SHOWROOM_VH = "/showroom/demo/vietnamese-heritage/photos";

export const CUSTOMER_PHOTOS: AlbumPhoto[] = [
  // Two carry a focal point, as a customer-tuned crop would; the rest are
  // left centred, which is what an upload with no focal data gives.
  { src: `${SHOWROOM_VH}/01-cover-doi-uyen-uong-ao-dai-tren-nen-do.webp`, alt: "Đôi uyên ương trong tà áo dài", width: 1086, height: 1448, focalPoint: { x: 0.5, y: 0.3 } },
  { src: `${SHOWROOM_VH}/02-couple-portrait-ao-dai-sac-do-le-hoi.webp`, alt: "Cô dâu và chú rể trong sắc đỏ lễ hội", width: 1086, height: 1448 },
  { src: `${SHOWROOM_VH}/10-playful-couple-ao-dai-red-black.webp`, alt: "Cô dâu và chú rể trong khoảnh khắc đời thường", width: 1086, height: 1448 },
  { src: `${SHOWROOM_VH}/03-bride-portrait-ao-dai-do-quat-xep.webp`, alt: "Cô dâu trong tà áo dài đỏ với chiếc quạt giấy", width: 1086, height: 1448, focalPoint: { x: 0.5, y: 0.28 } },
  { src: `${SHOWROOM_VH}/07-couple-ao-dai-red-lanterns.webp`, alt: "Cô dâu và chú rể bên dàn đèn lồng đỏ", width: 1086, height: 1448 },
  { src: `${SHOWROOM_VH}/05-tea-ceremony-traditional-vietnamese.webp`, alt: "Nghi thức dâng trà", width: 1448, height: 1086 },
  { src: `${SHOWROOM_VH}/09-celebration-confetti-red.webp`, alt: "Khoảnh khắc pháo giấy chúc mừng", width: 1086, height: 1448 },
  { src: `${SHOWROOM_VH}/04-groom-portrait-chu-re-ben-chu-hy-do.webp`, alt: "Chân dung chú rể", width: 1086, height: 1448 },
];
