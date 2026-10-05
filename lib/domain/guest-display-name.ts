/**
 * Personalized guest `display_name` (CLAUDE.md §10; docs/PRODUCT.md §13):
 * single free-form text, never decomposed into honorific/legal name. The
 * 200 limit mirrors the `guests.display_name` CHECK (0017) and the RSVP
 * typed-name rule (Unicode code points, not UTF-16 units). Duplicates are
 * legitimate and never rejected here.
 */
export const GUEST_DISPLAY_NAME_MAX_LENGTH = 200;

/** Trimmed display name, or `null` when it is not a string, blank, or too long. */
export function normalizeGuestDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || Array.from(trimmed).length > GUEST_DISPLAY_NAME_MAX_LENGTH) return null;
  return trimmed;
}
