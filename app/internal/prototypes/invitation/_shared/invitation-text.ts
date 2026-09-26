/**
 * Renders the general invitation sentence from a CUSTOMER/REGION-EDITABLE
 * template string (checkpoint V5 §B4 — wording differs by region/customer
 * preference and must never be hard-fixed in code). `{guest}` and
 * `{ceremonyTitle}` are the only substitution tokens; `ceremonyTitle` is
 * always supplied by the centralized variant resolver (`resolve-variant.ts`)
 * so COMMON/GROOM/BRIDE wording ("Lễ Thành Hôn" / "Lễ Vu Quy") never drifts
 * out of sync even though the surrounding sentence is freely editable.
 *
 * Production direction: `template` would live on the Project's intake/
 * design record, editable by staff or the customer — not in this function.
 */
export function buildInvitationMessage(
  template: string,
  ceremonyTitle: string,
  personalizationOn: boolean,
  guestDisplayName: string
): string {
  const trimmed = guestDisplayName.trim();
  const who = personalizationOn && trimmed.length > 0 ? trimmed : "Quý khách";
  return template.replace(/\{guest\}/g, who).replace(/\{ceremonyTitle\}/g, ceremonyTitle);
}

/**
 * Guest line for templates that print the salutation and the guest on
 * separate lines. Same personalization rule as `buildInvitationMessage`;
 * the non-personalized fallback is editable wording, not a code constant.
 */
export function resolveGuestLine(
  personalizationOn: boolean,
  guestDisplayName: string,
  defaultGuestLabel: string
): string {
  const trimmed = guestDisplayName.trim();
  return personalizationOn && trimmed.length > 0 ? trimmed : defaultGuestLabel;
}
