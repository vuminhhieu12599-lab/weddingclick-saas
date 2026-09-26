/**
 * Section-level ON/OFF toggle registry for the Task-029 prototype control
 * panel. Opening and Hero are always on and are not part of this list
 * (checkpoint spec §5). Section-level only — deliberately not field-level.
 */
export const SECTION_KEYS = [
  "mainText",
  "portraitStory",
  "family",
  "ceremony",
  "receptionTime",
  "venue",
  "directions",
  "countdown",
  "timeline",
  "threePhoto",
  "loveStory",
  "gallery",
  "rsvp",
  "gift",
  "dressCode",
  "closing",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export type SectionVisibility = Record<SectionKey, boolean>;

export const DEFAULT_SECTION_VISIBILITY: SectionVisibility = SECTION_KEYS.reduce((acc, key) => {
  acc[key] = true;
  return acc;
}, {} as SectionVisibility);

export const SECTION_LABELS: Record<SectionKey, string> = {
  mainText: "Lời mời chính",
  portraitStory: "Ảnh chú rể & cô dâu",
  family: "Thông tin gia đình",
  ceremony: "Thông tin lễ cưới",
  receptionTime: "Giờ tiệc",
  venue: "Địa điểm",
  directions: "Chỉ đường",
  countdown: "Đếm ngược",
  timeline: "Timeline",
  threePhoto: "Ảnh nổi bật",
  loveStory: "Chuyện tình yêu",
  gallery: "Album ảnh",
  rsvp: "RSVP",
  gift: "Mừng cưới",
  dressCode: "Dress code",
  closing: "Lời cảm ơn",
};
