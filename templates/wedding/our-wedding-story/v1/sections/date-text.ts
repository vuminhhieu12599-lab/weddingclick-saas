import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";

/**
 * Our Wedding Story v1 — joins already-derived RF-05C presentation parts
 * into display strings. Pure string composition: no parsing, no calendar
 * arithmetic, no Intl, no timezone logic.
 */

/** Visual Freeze v1 `DD.MM.YYYY` (masthead, cover, receptions, date caption, signature). */
export function formatDottedDate(presentation: EventDateTimePresentationV1): string {
  return `${presentation.day}.${presentation.month}.${presentation.year}`;
}
