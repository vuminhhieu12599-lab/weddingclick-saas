import { EVENT_SIDES, OCCASION_TYPES } from "../../domain";
import { ApiError } from "../errors/api-error";
import { isValidTimestamptz } from "../validation/timestamptz";
import type { ProjectEventInput } from "./project-events-types";

/**
 * Defensive app-layer cap on free-form text fields. Not a DB constraint —
 * migration 0009 leaves title/venue_name/address/description unbounded TEXT
 * (docs/PHYSICAL_DATABASE_PLAN.md §2.8) — this exists only to reject
 * obviously abusive payloads before they reach the database. A low-risk
 * implementation detail (CLAUDE.md §23), not a business rule. Mirrors
 * validate-save-wedding-details-input.ts's MAX_FIELD_LENGTH.
 */
const MAX_FIELD_LENGTH = 20000;

/**
 * Postgres `integer` (int4) bounds — sort_order is INTEGER NOT NULL in
 * migration 0009. Rejecting an out-of-range value here produces a safe 400
 * instead of an unhandled Postgres `integer out of range` error reaching
 * the generic 500 path.
 */
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

const NULLABLE_TEXT_FIELDS = ["venueName", "address", "description"] as const;

/**
 * Fields the client must never be able to set on a project_events create or
 * update — server-owned per migration 0009 (CLAUDE.md §2 "no unknown keys" /
 * task spec §3). Present at all (even with a server-matching value) ->
 * reject. Mirrors validate-save-wedding-details-input.ts's FORBIDDEN_FIELDS.
 */
const FORBIDDEN_FIELDS = [
  "id",
  "projectId",
  "project_id",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
] as const;

const ALL_ACCEPTED_FIELDS = new Set<string>([
  "occasionType",
  "side",
  "title",
  "startsAt",
  "timezone",
  "mapUrl",
  "sortOrder",
  "isPrimary",
  ...NULLABLE_TEXT_FIELDS,
]);

/**
 * IANA timezone validity check. Deliberately not `Intl.supportedValuesOf`
 * (`("timeZone")`) — ICU's canonicalized list omits legacy-but-still-valid
 * alias identifiers (e.g. "Asia/Ho_Chi_Minh", this project's own default
 * timezone — 0009/DATABASE.md §10 — is not in that list; only its canonical
 * form "Asia/Saigon" is), which would incorrectly reject the schema's own
 * default value. `Intl.DateTimeFormat` construction accepts any IANA
 * identifier the runtime recognizes, aliases included, and throws
 * `RangeError` for anything else.
 */
function isValidIanaTimeZone(value: string): boolean {
  if (value.trim().length === 0) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses/validates a raw POST/PUT project-events request body into a safe
 * ProjectEventInput (Task 023 §4).
 *
 * Both create and update are FULL-resource operations (project-events-types.ts
 * header, mirrors save_wedding_details' "full canonical Save, not
 * field-level autosave" convention) — every editable column must be
 * present. Nullable columns accept explicit `null` as "leave this field
 * empty"; a missing key is rejected rather than silently defaulted.
 */
export function validateProjectEventInput(body: unknown): ProjectEventInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;

  for (const forbiddenField of FORBIDDEN_FIELDS) {
    if (forbiddenField in record) {
      throw new ApiError(
        "BAD_REQUEST",
        `"${forbiddenField}" is not an accepted field — it is always server-derived`,
      );
    }
  }

  for (const key of Object.keys(record)) {
    if (!ALL_ACCEPTED_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }

  const occasionType = parseEnum(record, "occasionType", OCCASION_TYPES);
  const side = parseEnum(record, "side", EVENT_SIDES);
  const title = parseRequiredNonEmptyString(record, "title");
  const startsAt = parseRequiredIsoDateTime(record, "startsAt");
  const timezone = parseRequiredTimeZone(record, "timezone");
  const mapUrl = parseNullableHttpsUrl(record, "mapUrl");
  const sortOrder = parseRequiredInteger(record, "sortOrder");
  const isPrimary = parseRequiredBoolean(record, "isPrimary");

  const result = {
    occasionType,
    side,
    title,
    startsAt,
    timezone,
    mapUrl,
    sortOrder,
    isPrimary,
  } as ProjectEventInput;

  for (const field of NULLABLE_TEXT_FIELDS) {
    result[field] = parseNullableString(record, field);
  }

  return result;
}

function requireKey(record: Record<string, unknown>, fieldName: string): unknown {
  if (!(fieldName in record)) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" is required`);
  }
  return record[fieldName];
}

function parseEnum<T extends string>(
  record: Record<string, unknown>,
  fieldName: string,
  allowed: readonly T[],
): T {
  const value = requireKey(record, fieldName);

  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new ApiError(
      "BAD_REQUEST",
      `"${fieldName}" must be one of: ${allowed.join(", ")}`,
    );
  }

  return value as T;
}

function parseRequiredNonEmptyString(
  record: Record<string, unknown>,
  fieldName: string,
): string {
  const value = requireKey(record, fieldName);

  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a string`);
  }

  if (value.length > MAX_FIELD_LENGTH) {
    throw new ApiError(
      "BAD_REQUEST",
      `"${fieldName}" exceeds the maximum length of ${MAX_FIELD_LENGTH} characters`,
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must not be empty`);
  }

  return trimmed;
}

function parseNullableString(
  record: Record<string, unknown>,
  fieldName: string,
): string | null {
  const value = requireKey(record, fieldName);

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a string or null`);
  }

  if (value.length > MAX_FIELD_LENGTH) {
    throw new ApiError(
      "BAD_REQUEST",
      `"${fieldName}" exceeds the maximum length of ${MAX_FIELD_LENGTH} characters`,
    );
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Validates against the shared TIMESTAMPTZ contract (lib/server/validation/
 * timestamptz.ts, Task 005 Revision 1), the same one already applied to
 * projects.deadlineAt (validate-create-project-request.ts) — starts_at is
 * TIMESTAMPTZ NOT NULL (docs/PHYSICAL_DATABASE_PLAN.md §2.8). A bare
 * `new Date(value)` is too permissive: it accepts date-only strings and
 * offsetless datetimes (silently resolved against the server's local
 * timezone) and silently rolls forward impossible calendar dates instead of
 * rejecting them. `isValidTimestamptz` requires an explicit `Z`/offset and
 * validates the calendar date independently, so only unambiguous instants
 * pass; `.toISOString()` below is then a safe normalization step, never a
 * validation step.
 */
function parseRequiredIsoDateTime(record: Record<string, unknown>, fieldName: string): string {
  const value = requireKey(record, fieldName);

  if (typeof value !== "string" || !isValidTimestamptz(value)) {
    throw new ApiError(
      "BAD_REQUEST",
      `"${fieldName}" must be a timezone-aware RFC 3339 timestamp`,
    );
  }

  return new Date(value).toISOString();
}

function parseRequiredTimeZone(record: Record<string, unknown>, fieldName: string): string {
  const value = requireKey(record, fieldName);

  if (typeof value !== "string" || !isValidIanaTimeZone(value)) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a valid IANA timezone name`);
  }

  return value;
}

/** HTTPS-only per docs/SECURITY.md §13 — mirrors the 0009 map_url CHECK constraint. */
function parseNullableHttpsUrl(
  record: Record<string, unknown>,
  fieldName: string,
): string | null {
  const value = requireKey(record, fieldName);

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a string or null`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!trimmed.startsWith("https://")) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be an https:// URL`);
  }

  try {
    new URL(trimmed);
  } catch {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a valid URL`);
  }

  if (trimmed.length > MAX_FIELD_LENGTH) {
    throw new ApiError(
      "BAD_REQUEST",
      `"${fieldName}" exceeds the maximum length of ${MAX_FIELD_LENGTH} characters`,
    );
  }

  return trimmed;
}

function parseRequiredInteger(record: Record<string, unknown>, fieldName: string): number {
  const value = requireKey(record, fieldName);

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be an integer`);
  }

  if (value < INT4_MIN || value > INT4_MAX) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" is out of range`);
  }

  return value;
}

function parseRequiredBoolean(record: Record<string, unknown>, fieldName: string): boolean {
  const value = requireKey(record, fieldName);

  if (typeof value !== "boolean") {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a boolean`);
  }

  return value;
}
