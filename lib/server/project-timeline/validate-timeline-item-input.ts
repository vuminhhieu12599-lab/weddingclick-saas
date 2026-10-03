import { ApiError } from "../errors/api-error";
import type { ProjectTimelineItemInput, ProjectTimelineItemPatch } from "./project-timeline-write-gateway";

/** Staff input time: canonical `HH:mm` only (DB TIME(0) is written without seconds). */
export const TIMELINE_INPUT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Mirrors the 0029 CHECK: non-blank, at most 200 characters. */
export const TIMELINE_LABEL_MAX_LENGTH = 200;

/** Postgres `integer` (int4) bounds — sort_order is INTEGER NOT NULL. */
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

const ACCEPTED_FIELDS = new Set(["time", "label", "sortOrder"]);

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ACCEPTED_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }
  return record;
}

function parseTime(value: unknown): string {
  if (typeof value !== "string" || !TIMELINE_INPUT_TIME_PATTERN.test(value)) {
    throw new ApiError("BAD_REQUEST", `"time" must be a 24-hour HH:mm time`);
  }
  return value;
}

/** Plain text: trimmed, non-blank, at most 200 characters. */
function parseLabel(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"label" must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ApiError("BAD_REQUEST", `"label" must not be blank`);
  }
  if (trimmed.length > TIMELINE_LABEL_MAX_LENGTH) {
    throw new ApiError("BAD_REQUEST", `"label" exceeds ${TIMELINE_LABEL_MAX_LENGTH} characters`);
  }
  return trimmed;
}

function parseSortOrder(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < INT4_MIN || value > INT4_MAX) {
    throw new ApiError("BAD_REQUEST", `"sortOrder" must be an integer`);
  }
  return value;
}

/** POST body: every field is required (no default time, label or order is invented). */
export function validateCreateTimelineItemInput(body: unknown): ProjectTimelineItemInput {
  const record = asRecord(body);
  for (const field of ACCEPTED_FIELDS) {
    if (!(field in record)) {
      throw new ApiError("BAD_REQUEST", `"${field}" is required`);
    }
  }
  return { time: parseTime(record.time), label: parseLabel(record.label), sortOrder: parseSortOrder(record.sortOrder) };
}

/** PATCH body: a genuine partial update; at least one field. */
export function validateUpdateTimelineItemInput(body: unknown): ProjectTimelineItemPatch {
  const record = asRecord(body);
  const patch: ProjectTimelineItemPatch = {};
  if ("time" in record) patch.time = parseTime(record.time);
  if ("label" in record) patch.label = parseLabel(record.label);
  if ("sortOrder" in record) patch.sortOrder = parseSortOrder(record.sortOrder);
  if (Object.keys(patch).length === 0) {
    throw new ApiError("BAD_REQUEST", "At least one editable field is required");
  }
  return patch;
}
