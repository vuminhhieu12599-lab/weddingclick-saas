import { PROJECT_TASK_STATUSES, type ProjectTaskStatus } from "../../domain";
import { ApiError } from "../errors/api-error";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";
import type { ProjectTaskInput, ProjectTaskPatch } from "./project-task-types";

/** Mirrors the 0019 CHECK `char_length(title) BETWEEN 1 AND 200` (Unicode code points). */
export const PROJECT_TASK_TITLE_MAX_LENGTH = 200;

/** Postgres `integer` (int4) bounds — sort_order is INTEGER NOT NULL. */
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

const CREATE_FIELDS = new Set(["title", "dueAt", "assignedStaffId", "sortOrder"]);
const UPDATE_FIELDS = new Set(["title", "status", "dueAt", "assignedStaffId", "sortOrder"]);

function asRecord(body: unknown, accepted: ReadonlySet<string>): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!accepted.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }
  return record;
}

/** Plain text: trimmed, non-blank, at most 200 code points. */
function parseTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"title" must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ApiError("BAD_REQUEST", `"title" must not be blank`);
  }
  if ([...trimmed].length > PROJECT_TASK_TITLE_MAX_LENGTH) {
    throw new ApiError("BAD_REQUEST", `"title" exceeds ${PROJECT_TASK_TITLE_MAX_LENGTH} characters`);
  }
  return trimmed;
}

function parseStatus(value: unknown): ProjectTaskStatus {
  if (typeof value !== "string" || !(PROJECT_TASK_STATUSES as readonly string[]).includes(value)) {
    throw new ApiError("BAD_REQUEST", `"status" must be one of ${PROJECT_TASK_STATUSES.join(", ")}`);
  }
  return value as ProjectTaskStatus;
}

/** `null` or an RFC 3339 timestamp with an explicit offset (TIMESTAMPTZ). */
function parseDueAt(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !isValidTimestamptz(value)) {
    throw new ApiError("BAD_REQUEST", `"dueAt" must be null or an ISO-8601 timestamp with a timezone`);
  }
  return value;
}

/** Shape only; whether it is an active staff profile is checked by the use case. */
function parseAssignedStaffId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new ApiError("BAD_REQUEST", `"assignedStaffId" must be null or a valid UUID`);
  }
  return value.toLowerCase();
}

function parseSortOrder(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < INT4_MIN || value > INT4_MAX) {
    throw new ApiError("BAD_REQUEST", `"sortOrder" must be an integer`);
  }
  return value;
}

/** POST body: `title` required; `dueAt`/`assignedStaffId` default to null; status is never accepted (DB default TODO). */
export function validateCreateProjectTaskInput(body: unknown): ProjectTaskInput {
  const record = asRecord(body, CREATE_FIELDS);
  if (!("title" in record)) {
    throw new ApiError("BAD_REQUEST", `"title" is required`);
  }
  const input: ProjectTaskInput = {
    title: parseTitle(record.title),
    dueAt: "dueAt" in record ? parseDueAt(record.dueAt) : null,
    assignedStaffId: "assignedStaffId" in record ? parseAssignedStaffId(record.assignedStaffId) : null,
  };
  if ("sortOrder" in record) input.sortOrder = parseSortOrder(record.sortOrder);
  return input;
}

/** PATCH body: a genuine partial update; at least one field. No status-transition rules (operational data). */
export function validateUpdateProjectTaskInput(body: unknown): ProjectTaskPatch {
  const record = asRecord(body, UPDATE_FIELDS);
  const patch: ProjectTaskPatch = {};
  if ("title" in record) patch.title = parseTitle(record.title);
  if ("status" in record) patch.status = parseStatus(record.status);
  if ("dueAt" in record) patch.dueAt = parseDueAt(record.dueAt);
  if ("assignedStaffId" in record) patch.assignedStaffId = parseAssignedStaffId(record.assignedStaffId);
  if ("sortOrder" in record) patch.sortOrder = parseSortOrder(record.sortOrder);
  if (Object.keys(patch).length === 0) {
    throw new ApiError("BAD_REQUEST", "At least one editable field is required");
  }
  return patch;
}
