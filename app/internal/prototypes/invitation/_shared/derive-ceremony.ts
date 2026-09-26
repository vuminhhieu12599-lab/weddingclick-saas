import type { DerivedCeremonyDisplay } from "./types";

/**
 * Single derivation point for every date/time/weekday/countdown display
 * value, from one canonical ISO instant (CLAUDE.md §7 — never hard-code
 * weekday/date/countdown separately). Prototype-scope only: the real
 * Task-029 Wedding Domain Resolver owns this for production.
 */
export function deriveCeremonyDisplay(
  isoDateTime: string,
  timeZone: string,
  locale = "vi-VN"
): DerivedCeremonyDisplay {
  const date = new Date(isoDateTime);

  const weekdayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone,
  }).format(date);

  const dayLabel = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    timeZone,
  }).format(date);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    timeZone,
  }).format(date);

  const yearLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    timeZone,
  }).format(date);

  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);

  const fullDateLabel = `${dayLabel}.${monthLabel}.${yearLabel}`;

  return { weekdayLabel, dayLabel, monthLabel, yearLabel, timeLabel, fullDateLabel };
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  hasPassed: boolean;
}

/** Derived from the same canonical instant used above — never a second parse. */
export function deriveCountdown(isoDateTime: string, now: Date): CountdownParts {
  const target = new Date(isoDateTime).getTime();
  const diffMs = target - now.getTime();

  if (diffMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, hasPassed: true };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, hasPassed: false };
}

export interface CalendarMonth {
  year: number;
  /** 1–12. */
  month: number;
  /** The highlighted day of the month (1–31). */
  day: number;
  /** Sunday-first grid cells: null for leading blanks, then 1…daysInMonth. */
  cells: Array<number | null>;
}

/**
 * Month grid for decorative wedding calendars, derived from the same
 * canonical instant in the event time zone — month, year, first weekday and
 * days-in-month are computed, never hard-coded (CLAUDE.md §7).
 */
export function deriveCalendarMonth(isoDateTime: string, timeZone: string): CalendarMonth {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone,
  }).formatToParts(new Date(isoDateTime));
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  // Pure calendar arithmetic on the civil date — UTC avoids viewer-zone drift.
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: Array<number | null> = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return { year, month, day, cells };
}
