import type { CeremonyMonthGridV1 } from "../../../../../lib/invitation-rendering/ceremony-month-grid";

/** One Task 029 calendar cell: a leading blank, or a day of the ceremony month. */
export type CalendarCell = { readonly kind: "blank" } | { readonly kind: "day"; readonly day: number; readonly isCeremonyDay: boolean };

/**
 * Re-indexes the shared RF-05C Monday-first month grid into the Task 029
 * Sunday-first layout: leading blanks, then exactly the ceremony month's days
 * (no trailing cells). Pure index arithmetic over the derived cells — no date
 * parsing, weekday or month-length computation here.
 */
export function sundayFirstCalendarCells(grid: CeremonyMonthGridV1): CalendarCell[] {
  const firstInMonth = grid.cells.findIndex((cell) => cell.inCeremonyMonth);
  // The grid starts on a Monday, so `firstInMonth` is the 1st's Monday-first weekday index.
  const leadingBlanks = (firstInMonth + 1) % 7;
  const blanks: CalendarCell[] = Array.from({ length: leadingBlanks }, () => ({ kind: "blank" }));
  const days: CalendarCell[] = grid.cells
    .filter((cell) => cell.inCeremonyMonth)
    .map((cell) => ({ kind: "day", day: cell.day, isCeremonyDay: cell.isCeremonyDay }));
  return [...blanks, ...days];
}
