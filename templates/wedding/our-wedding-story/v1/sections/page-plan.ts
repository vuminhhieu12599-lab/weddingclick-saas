/**
 * Our Wedding Story v1 editorial page numbering (Visual Freeze v1): the cover
 * is page 01 and the body sections are numbered 02, 03, … in their fixed
 * order, counting only the sections actually shown, so a hidden optional
 * section never leaves a gap.
 */

export const OWS_BODY_SECTIONS = ["families", "couple", "invitation", "date", "gallery", "rsvpGift", "thanks"] as const;

export type OwsBodySection = (typeof OWS_BODY_SECTIONS)[number];

export type OwsBodyVisibility = Readonly<Record<OwsBodySection, boolean>>;

/** Two-digit page number per visible section, in fixed order; hidden sections are absent. */
export function owsPageNumbers(visibility: OwsBodyVisibility): Partial<Record<OwsBodySection, string>> {
  const numbers: Partial<Record<OwsBodySection, string>> = {};
  let page = 2;
  for (const section of OWS_BODY_SECTIONS) {
    if (!visibility[section]) continue;
    numbers[section] = String(page).padStart(2, "0");
    page += 1;
  }
  return numbers;
}
