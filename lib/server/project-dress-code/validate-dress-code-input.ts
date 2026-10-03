import { DRESS_CODE_SWATCH_COLOR_PATTERN } from "../../invitation-rendering/snapshot-payload-types";
import { ApiError } from "../errors/api-error";
import type { ProjectDressCodeSwatchInput, ProjectDressCodeSwatchPatch } from "./project-dress-code-write-gateway";

/** Mirrors the 0030 CHECK: non-blank when present, at most 1000 characters. */
export const DRESS_CODE_DESCRIPTION_MAX_LENGTH = 1000;

const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

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

/**
 * PUT body `{ description: string | null }` (required key). A blank string
 * clears the description to `null`; no default text is ever invented.
 */
export function validateSaveDressCodeInput(body: unknown): { description: string | null } {
  const record = asRecord(body, new Set(["description"]));
  if (!("description" in record)) {
    throw new ApiError("BAD_REQUEST", `"description" is required`);
  }
  const value = record.description;
  if (value === null) return { description: null };
  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"description" must be a string or null`);
  }
  const trimmed = value.trim();
  if (trimmed.length > DRESS_CODE_DESCRIPTION_MAX_LENGTH) {
    throw new ApiError("BAD_REQUEST", `"description" exceeds ${DRESS_CODE_DESCRIPTION_MAX_LENGTH} characters`);
  }
  return { description: trimmed.length === 0 ? null : trimmed };
}

/** Strict canonical `#rrggbb` lowercase only — never normalized, never a CSS keyword/function. */
function parseColor(value: unknown): string {
  if (typeof value !== "string" || !DRESS_CODE_SWATCH_COLOR_PATTERN.test(value)) {
    throw new ApiError("BAD_REQUEST", `"color" must be a lowercase #rrggbb hex colour`);
  }
  return value;
}

function parseSortOrder(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < INT4_MIN || value > INT4_MAX) {
    throw new ApiError("BAD_REQUEST", `"sortOrder" must be an integer`);
  }
  return value;
}

const SWATCH_FIELDS: ReadonlySet<string> = new Set(["color", "sortOrder"]);

export function validateCreateSwatchInput(body: unknown): ProjectDressCodeSwatchInput {
  const record = asRecord(body, SWATCH_FIELDS);
  for (const field of SWATCH_FIELDS) {
    if (!(field in record)) {
      throw new ApiError("BAD_REQUEST", `"${field}" is required`);
    }
  }
  return { color: parseColor(record.color), sortOrder: parseSortOrder(record.sortOrder) };
}

export function validateUpdateSwatchInput(body: unknown): ProjectDressCodeSwatchPatch {
  const record = asRecord(body, SWATCH_FIELDS);
  const patch: ProjectDressCodeSwatchPatch = {};
  if ("color" in record) patch.color = parseColor(record.color);
  if ("sortOrder" in record) patch.sortOrder = parseSortOrder(record.sortOrder);
  if (Object.keys(patch).length === 0) {
    throw new ApiError("BAD_REQUEST", "At least one editable field is required");
  }
  return patch;
}
