/**
 * Thrown when a `project_timeline_items.time_of_day` value read from the
 * database is not the exact whole-minute TIME(0) text form `HH:mm:00`. It
 * signals a data-integrity/adapter fault and is never turned into an empty
 * Timeline or a truncated time.
 */
export class TimelineTimeOfDayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineTimeOfDayError";
  }
}

/**
 * PostgREST returns TIME(0) as `HH:mm:ss` (verified on DEV/STAGING, e.g.
 * `08:30:00`). The 0029 CHECK keeps seconds at zero, so only `HH:mm:00` is
 * accepted.
 */
const DATABASE_TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d:00$/;

/**
 * Converts the database TIME(0) text to the canonical Snapshot `HH:mm`
 * (docs/PHYSICAL_DATABASE_PLAN.md §2.9a). Anything else — non-zero seconds,
 * fractional seconds, a timezone suffix, an out-of-range or non-string
 * value — throws instead of being silently truncated.
 */
export function toCanonicalTimelineTime(value: unknown): string {
  if (typeof value !== "string" || !DATABASE_TIME_OF_DAY_PATTERN.test(value)) {
    throw new TimelineTimeOfDayError("Timeline time_of_day is not a whole-minute HH:mm:00 value");
  }
  return value.slice(0, 5);
}
