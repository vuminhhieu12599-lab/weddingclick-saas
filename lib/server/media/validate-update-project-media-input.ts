import { ApiError } from "../errors/api-error";
import type { UpdateProjectMediaPatch } from "./media-types";

/**
 * Defensive app-layer cap on free-form text — mirrors
 * validate-finalize-media-input.ts's MAX_FIELD_LENGTH exactly. Not a new
 * limit.
 */
const MAX_FIELD_LENGTH = 20000;

/** Postgres `integer` (int4) bounds — sort_order is INTEGER NOT NULL (migration 0007). */
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

/**
 * Strict allow-list (Task 024 Phase 3): the only two fields the frozen
 * contract classifies as "safe, non-domain-meaningful edits" (API_CONTRACT.md
 * §3.2). Every other project_media column — including `mediaType`, which
 * remains API-immutable even though the DB trigger only freezes
 * storage_bucket/storage_path — is rejected as unknown.
 */
const ACCEPTED_FIELDS = new Set(["altText", "sortOrder"]);

/**
 * Parses/validates a raw PATCH request body (Task 024 Phase 3).
 *
 * Field presence is preserved deliberately: the returned
 * `UpdateProjectMediaPatch` contains a key only when the request body
 * actually included it, so the repository can build a genuine partial
 * `.update({...})` payload — never a full-row read-modify-write (see
 * update-project-media.ts / project-media-repository.ts). An empty body
 * (or a body whose only keys resolve to nothing, which cannot actually
 * happen with this allow-list) is rejected outright — the caller must
 * never fall back to a read just to make an empty PATCH "succeed."
 */
export function validateUpdateProjectMediaInput(body: unknown): UpdateProjectMediaPatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ACCEPTED_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }

  const patch: UpdateProjectMediaPatch = {};

  if ("altText" in record) {
    patch.altText = parseAltText(record.altText);
  }

  if ("sortOrder" in record) {
    patch.sortOrder = parseSortOrder(record.sortOrder);
  }

  if (Object.keys(patch).length === 0) {
    throw new ApiError("BAD_REQUEST", "At least one editable field is required");
  }

  return patch;
}

/** Nullable free-text (alt_text TEXT NULL, migration 0007): explicit null clears it. */
function parseAltText(value: unknown): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"altText" must be a string or null`);
  }

  if (value.length > MAX_FIELD_LENGTH) {
    throw new ApiError(
      "BAD_REQUEST",
      `"altText" exceeds the maximum length of ${MAX_FIELD_LENGTH} characters`,
    );
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** sort_order is INTEGER NOT NULL (migration 0007): PATCH never accepts null here. */
function parseSortOrder(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError("BAD_REQUEST", `"sortOrder" must be an integer`);
  }

  if (value < INT4_MIN || value > INT4_MAX) {
    throw new ApiError("BAD_REQUEST", `"sortOrder" is out of range`);
  }

  return value;
}
