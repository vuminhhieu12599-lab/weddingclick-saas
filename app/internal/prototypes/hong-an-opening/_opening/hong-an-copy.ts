/**
 * HA-OPEN-01 — the live text shown over the Hồng Ân opening.
 *
 * Demo content only. It stands in for the fields a Project would supply
 * through the InvitationViewModel; nothing here is embedded in an image,
 * which is the point of the exercise (names, date and verse must stay
 * selectable, translatable and correct at every viewport).
 *
 * Prototype-only: static data, no Supabase, no API, no Project.
 */

/** CLAUDE.md §7 — the default timezone for a Vietnamese Project. */
export const CEREMONY_TIMEZONE = "Asia/Ho_Chi_Minh";

export type HongAnOpeningCopy = {
  readonly eyebrow: string;
  /**
   * The editorial brand line on the cover. V4 restores it as a small
   * header above the couple: present, but set well below their names so
   * the card still speaks the couple first (Product Owner, V4 handoff).
   */
  readonly templateName: string;
  /** The one canonical ceremony instant. Every date part derives from it. */
  readonly ceremonyAt: string;
  readonly groom: { readonly full: string; readonly short: string };
  readonly bride: { readonly full: string; readonly short: string };
  readonly parish: string;
  readonly verse: { readonly text: string; readonly reference: string };
  readonly openLabel: string;
  /** Described, not decorative: the photograph is the hero of the card. */
  readonly heroPhotoAlt: string;
};

export const HONG_AN_DEMO_COPY: HongAnOpeningCopy = {
  eyebrow: "Bí tích Hôn phối",
  templateName: "Hồng Ân",
  // Matches the date and spelling baked into the approved V4 review
  // frames, so the preview can be compared against them one to one.
  ceremonyAt: "2026-11-28T09:00:00+07:00",
  groom: { full: "Gioan Baotixita Nguyễn Minh An", short: "Minh An" },
  bride: { full: "Maria Trần Thùy Linh", short: "Thùy Linh" },
  parish: "Nhà thờ Giáo xứ Tân Định",
  verse: {
    text: "Điều gì Thiên Chúa đã liên kết thì con người không được phân ly.",
    reference: "Mt 19,6",
  },
  openLabel: "MỞ THIỆP CƯỚI",
  heroPhotoAlt: "Ảnh cưới của cô dâu và chú rể",
};

export type CeremonyDateParts = {
  readonly weekday: string;
  readonly day: string;
  readonly month: string;
  readonly year: string;
  readonly time: string;
  /** ISO value for `<time dateTime>`, so the markup carries the canonical instant. */
  readonly iso: string;
};

/**
 * CLAUDE.md §7 — weekday, day, month, year and time are all formatted from
 * the single `ceremonyAt` instant in the Project's timezone. Nothing is
 * hard-coded and nothing is computed twice, so the parts cannot disagree.
 */
export function ceremonyDateParts(
  ceremonyAt: string,
  timeZone: string = CEREMONY_TIMEZONE,
): CeremonyDateParts {
  const at = new Date(ceremonyAt);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`HA-OPEN-01: invalid ceremonyAt value "${ceremonyAt}"`);
  }
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("vi-VN", { ...options, timeZone }).format(at);

  return {
    weekday: part({ weekday: "long" }),
    day: part({ day: "2-digit" }),
    month: part({ month: "2-digit" }),
    year: part({ year: "numeric" }),
    time: part({ hour: "2-digit", minute: "2-digit", hour12: false }),
    iso: at.toISOString(),
  };
}
