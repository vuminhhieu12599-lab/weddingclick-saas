/**
 * Formats an integer VND amount for display (CLAUDE.md §16 "Money is stored
 * as integer VND values"). Never used to derive/round a price — display only.
 */
export function formatVnd(amountVnd: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amountVnd)} ₫`;
}
