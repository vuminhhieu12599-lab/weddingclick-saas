import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";

/**
 * Romantic Minimal v1 — joins already-derived RF-05C presentation parts into
 * display strings. Pure string composition: no parsing, no calendar
 * arithmetic, no Intl, no timezone logic.
 */

/** Task 029 `DD.MM.YYYY` (cover, reception, Thank You). */
export function formatDottedDate(presentation: EventDateTimePresentationV1): string {
  return `${presentation.day}.${presentation.month}.${presentation.year}`;
}

/** Task 029 Save The Date line `DD . MM . YYYY`. */
export function formatSpacedDate(presentation: EventDateTimePresentationV1): string {
  return `${presentation.day} . ${presentation.month} . ${presentation.year}`;
}
