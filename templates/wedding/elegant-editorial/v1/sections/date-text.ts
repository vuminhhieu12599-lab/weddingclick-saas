import type { EventDateTimePresentationV1 } from "../../../../../lib/invitation-rendering/event-date-time-presentation";

/**
 * Elegant Editorial v1 — joins already-derived RF-05C presentation parts
 * into display strings. Pure string composition: no parsing, no calendar
 * arithmetic, no Intl, no timezone logic (RF-05 K30–K31).
 */

/** `DD . MM . YYYY` from the RF-05C parts. */
export function formatDottedDate(presentation: EventDateTimePresentationV1): string {
  return `${presentation.day} . ${presentation.month} . ${presentation.year}`;
}

/** `DD/MM/YYYY` from the RF-05C parts. */
export function formatSlashedDate(presentation: EventDateTimePresentationV1): string {
  return `${presentation.day}/${presentation.month}/${presentation.year}`;
}
