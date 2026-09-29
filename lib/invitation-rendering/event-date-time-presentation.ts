import {
  daysFromCivil,
  mondayFirstWeekdayIndex,
  parseCanonicalInstantEpochMs,
  resolveCivilDateTime,
} from "./civil-date-time";
import type { ViewModelEvent } from "./invitation-view-model-types";

/**
 * Invitation Rendering Foundation RF-05C — shared pure event date/time
 * presentation (docs/DECISIONS.md RF-05 clarification K30–K32).
 *
 * Every output part derives from the event's canonical `startsAt` in the
 * event's own IANA `timezone`. The weekday is computed arithmetically from
 * the civil date, never from localized Intl text. `lunarDateDisplay` is not
 * read (K32).
 */

/** Fixed v1 weekday vocabulary, Monday → Sunday (K31). */
export const VIETNAMESE_WEEKDAY_LABELS_V1 = [
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ Nhật",
] as const;

export type VietnameseWeekdayLabelV1 = (typeof VIETNAMESE_WEEKDAY_LABELS_V1)[number];

/** ASCII-digit presentation parts: `DD`, `MM`, `YYYY`, 24-hour `HH:mm`. */
export interface EventDateTimePresentationV1 {
  readonly weekday: VietnameseWeekdayLabelV1;
  readonly day: string;
  readonly month: string;
  readonly year: string;
  readonly time: string;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * Accepts the ceremony or any ViewModel event entry; only `startsAt` and
 * `timezone` are read. Invalid timestamps or timezones throw `RangeError`.
 */
export function deriveEventDateTimePresentationV1(
  event: Pick<ViewModelEvent, "startsAt" | "timezone">,
): EventDateTimePresentationV1 {
  const epochMs = parseCanonicalInstantEpochMs(event.startsAt);
  const civil = resolveCivilDateTime(epochMs, event.timezone);
  const weekdayIndex = mondayFirstWeekdayIndex(daysFromCivil(civil.year, civil.month, civil.day));

  return {
    weekday: VIETNAMESE_WEEKDAY_LABELS_V1[weekdayIndex],
    day: pad(civil.day, 2),
    month: pad(civil.month, 2),
    year: pad(civil.year, 4),
    time: `${pad(civil.hour, 2)}:${pad(civil.minute, 2)}`,
  };
}
