/**
 * Elegant Editorial v1 — decorative couple display name (Product Owner
 * ruling, Micro-Checkpoint 1): the large decorative bride/groom names show
 * only the final two whitespace-separated tokens of the canonical name
 * ("Nguyễn Minh Khôi" → "Minh Khôi"). One- and two-token names are shown as
 * given (trimmed, inner whitespace collapsed).
 *
 * Presentation only and scoped to this renderer: the canonical person name
 * is never changed, and family/parent names, guest names and every other
 * text keep their canonical value.
 */
export function formatCoupleDisplayName(name: string): string {
  const tokens = name.trim().split(/\s+/u);
  return tokens.slice(-2).join(" ");
}
