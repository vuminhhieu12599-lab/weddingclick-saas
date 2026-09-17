import { MEDIA_TYPES, type MediaType } from "../../domain";
import { ApiError } from "../errors/api-error";
import type { FinalizeMediaInput } from "./media-types";

/**
 * Defensive app-layer cap on free-form text — mirrors
 * validate-project-event-input.ts's / validate-save-wedding-details-input.ts's
 * MAX_FIELD_LENGTH exactly (Task 024 Phase 2 §2: "apply the same defensive
 * free-text limit already established"). Not a new limit.
 */
const MAX_FIELD_LENGTH = 20000;

/** Postgres `integer` (int4) bounds — sort_order is INTEGER NOT NULL (migration 0007). */
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

/**
 * Strict allow-list (Task 024 Phase 2 §2): `mimeType`/`sizeBytes` are
 * deliberately never accepted here (Storage's own reported metadata is
 * authoritative — see finalize-media.ts), and every DB-owned field
 * (`storageBucket`, `projectId`, `createdBy`, `width`, `height`, `id`,
 * `createdAt`, `updatedAt`) is rejected as unknown.
 */
const ACCEPTED_FIELDS = new Set(["mediaType", "storagePath", "altText", "sortOrder"]);

const UUID_SEGMENT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Parses/validates a raw finalize request body (Task 024 Phase 2 §2).
 *
 * `canonicalProjectId` is the already-format-validated, already-lowercased
 * project id from the URL path (see finalize-media.ts) — passed in because
 * storagePath validation is a cross-field check against it, not a
 * body-only concern the way every other field here is.
 */
export function validateFinalizeMediaInput(
  body: unknown,
  canonicalProjectId: string,
): FinalizeMediaInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ACCEPTED_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }

  const mediaType = parseMediaType(record);
  const storagePath = parseStoragePath(record, canonicalProjectId);
  const altText = parseNullableAltText(record);
  const sortOrder = parseSortOrder(record);

  return { mediaType, storagePath, altText, sortOrder };
}

function requireKey(record: Record<string, unknown>, fieldName: string): unknown {
  if (!(fieldName in record)) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" is required`);
  }
  return record[fieldName];
}

function parseMediaType(record: Record<string, unknown>): MediaType {
  const value = requireKey(record, "mediaType");

  if (typeof value !== "string" || !(MEDIA_TYPES as readonly string[]).includes(value)) {
    throw new ApiError("BAD_REQUEST", `"mediaType" must be one of: ${MEDIA_TYPES.join(", ")}`);
  }

  return value as MediaType;
}

/**
 * Exact-match check: `<canonicalProjectId>/<uuid>`, anchored start-to-end —
 * no third segment, no query/hash, no extension possible. `canonicalProjectId`
 * is guaranteed by the caller to already be format-validated (isValidUuid)
 * and lowercased, so it contains only `[0-9a-f-]` characters — safe to
 * interpolate directly into a RegExp with no escaping needed.
 */
function parseStoragePath(record: Record<string, unknown>, canonicalProjectId: string): string {
  const value = requireKey(record, "storagePath");

  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"storagePath" must be a string`);
  }

  const pattern = new RegExp(`^${canonicalProjectId}/${UUID_SEGMENT}$`);
  if (!pattern.test(value)) {
    throw new ApiError(
      "BAD_REQUEST",
      `"storagePath" must be of the form "<projectId>/<uuid>" for this project`,
    );
  }

  return value;
}

/** Nullable free-text (alt_text TEXT NULL, migration 0007): absent key and explicit null both mean "no alt text." */
function parseNullableAltText(record: Record<string, unknown>): string | null {
  if (!("altText" in record) || record.altText === null) {
    return null;
  }

  const value = record.altText;

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

/** sort_order is INTEGER NOT NULL DEFAULT 0 (migration 0007): absent key defaults to 0; present value must be a definite int4 (never null). */
function parseSortOrder(record: Record<string, unknown>): number {
  if (!("sortOrder" in record)) {
    return 0;
  }

  const value = record.sortOrder;

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError("BAD_REQUEST", `"sortOrder" must be an integer`);
  }

  if (value < INT4_MIN || value > INT4_MAX) {
    throw new ApiError("BAD_REQUEST", `"sortOrder" is out of range`);
  }

  return value;
}
