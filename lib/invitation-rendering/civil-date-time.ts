import { isValidTimestamptz } from "../server/validation/timestamptz";

/**
 * Invitation Rendering Foundation RF-05C — PRIVATE civil date/time
 * machinery shared by the pure temporal derivations (docs/DECISIONS.md
 * RF-05 clarification K27–K33). Not exported from the package index.
 *
 * Deterministic and synchronous: every function depends only on its explicit
 * arguments. There is no current time, no machine-timezone dependency and no
 * Date object. Invalid input throws `RangeError`; nothing is repaired.
 */

/** A Gregorian civil date/time in some explicit IANA timezone. */
export interface CivilDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/**
 * Strictly validates a canonical `timestamptz` value (explicit `Z`/`±HH:MM`
 * offset required) and returns its absolute epoch milliseconds.
 */
export function parseCanonicalInstantEpochMs(startsAt: string): number {
  if (typeof startsAt !== "string" || !isValidTimestamptz(startsAt)) {
    throw new RangeError("startsAt is not a canonical timestamptz value");
  }
  const epochMs = Date.parse(startsAt);
  if (!Number.isFinite(epochMs)) {
    throw new RangeError("startsAt does not parse to a finite instant");
  }
  return epochMs;
}

const REQUIRED_PART_TYPES = ["year", "month", "day", "hour", "minute"] as const;

type RequiredPartType = (typeof REQUIRED_PART_TYPES)[number];

const ASCII_DIGITS = /^[0-9]+$/;

/**
 * Resolves the civil date/time of an absolute instant in the given IANA
 * timezone. Intl is used only to apply the timezone rules; only numeric
 * parts are read (never localized weekday or punctuation).
 */
export function resolveCivilDateTime(epochMs: number, timezone: string): CivilDateTime {
  if (!Number.isFinite(epochMs)) {
    throw new RangeError("epochMs must be a finite number");
  }
  if (typeof timezone !== "string" || timezone.length === 0) {
    throw new RangeError("timezone must be a non-empty IANA timezone string");
  }

  // An unknown timezone throws RangeError here; it is intentionally not caught.
  const formatter = new Intl.DateTimeFormat("vi-VN", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const values = new Map<RequiredPartType, number>();
  for (const part of formatter.formatToParts(epochMs)) {
    const type = part.type as string;
    if (!(REQUIRED_PART_TYPES as readonly string[]).includes(type)) continue;
    const key = type as RequiredPartType;
    if (values.has(key)) {
      throw new RangeError(`duplicate civil "${key}" part`);
    }
    if (!ASCII_DIGITS.test(part.value)) {
      throw new RangeError(`non-ASCII-digit civil "${key}" part`);
    }
    values.set(key, Number(part.value));
  }

  const read = (key: RequiredPartType): number => {
    const value = values.get(key);
    if (value === undefined) {
      throw new RangeError(`missing civil "${key}" part`);
    }
    return value;
  };

  const civil: CivilDateTime = {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };

  if (civil.year < 1 || civil.year > 9999) {
    throw new RangeError("civil year out of range");
  }
  if (civil.hour > 23 || civil.minute > 59) {
    throw new RangeError("civil time out of range");
  }
  assertValidCivilDate(civil.year, civil.month, civil.day);

  return civil;
}

/**
 * Days since 1970-01-01 for a proleptic Gregorian civil date
 * (Howard Hinnant's `days_from_civil`). Pure integer arithmetic.
 */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month > 2 ? month - 3 : month + 9) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** Inverse of `daysFromCivil` (Howard Hinnant's `civil_from_days`). */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** Monday = 0 … Sunday = 6, from a `daysFromCivil` day number (1970-01-01 was a Thursday). */
export function mondayFirstWeekdayIndex(days: number): number {
  return (((days + 3) % 7) + 7) % 7;
}

/** Rejects non-integer or impossible civil dates (e.g. 2027-02-29) via a round trip. */
export function assertValidCivilDate(year: number, month: number, day: number): void {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new RangeError("civil date parts must be integers");
  }
  if (month < 1 || month > 12 || day < 1) {
    throw new RangeError("civil date out of range");
  }
  const roundTrip = civilFromDays(daysFromCivil(year, month, day));
  if (roundTrip.year !== year || roundTrip.month !== month || roundTrip.day !== day) {
    throw new RangeError("civil date does not exist");
  }
}
