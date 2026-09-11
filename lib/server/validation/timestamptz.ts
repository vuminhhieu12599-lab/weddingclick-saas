/**
 * Dependency-free RFC 3339 / ISO-8601 timestamp validator for request
 * parsing (Task 005 Revision 1).
 *
 * `Date.parse()` alone is too permissive for a value that must map onto a
 * `TIMESTAMPTZ` column: it accepts date-only strings, offsetless
 * timestamps, and other implementation-dependent formats, and it silently
 * normalizes out-of-range calendar values (e.g. "2026-02-30" rolls forward
 * instead of failing). This validator requires an explicit timezone
 * (`Z` or `±HH:MM`) and independently checks the calendar date, so it
 * rejects everything `Date.parse()` would over-accept.
 */
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isValidTimestamptz(value: string): boolean {
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, offset] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  if (month < 1 || month > 12) {
    return false;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }
  if (!isValidCalendarDate(year, month, day)) {
    return false;
  }
  if (offset !== "Z" && !isValidOffset(offset)) {
    return false;
  }

  return true;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (day < 1) {
    return false;
  }

  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return day <= daysInMonth[month - 1];
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isValidOffset(offset: string): boolean {
  const match = /^[+-](\d{2}):(\d{2})$/.exec(offset);
  if (!match) {
    return false;
  }

  const offsetHour = Number(match[1]);
  const offsetMinute = Number(match[2]);

  return offsetHour <= 23 && offsetMinute <= 59;
}
