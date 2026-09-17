import {
  MEDIA_TYPES,
  allowedMimeTypesForMediaType,
  maxBytesForMediaType,
  type MediaType,
} from "../../domain";
import { ApiError } from "../errors/api-error";
import type { UploadIntentInput } from "./media-types";

/**
 * Strict allow-list (Task 024 Phase 2 §0): `projectId` comes from the URL
 * path, never the body; `storageBucket`/`storagePath`/`createdBy` and every
 * other server-owned field must never be client-settable at intent time.
 * Any key outside this set is rejected as unknown — that alone is enough
 * to reject every forbidden field named in the spec.
 */
const ACCEPTED_FIELDS = new Set(["mediaType", "mimeType", "sizeBytes"]);

/**
 * Parses/validates a raw upload-intent request body (Task 024 Phase 2 §1).
 *
 * These checks are advisory/fail-fast only — they reject an upload before
 * a signed URL is even issued, but cannot constrain what the browser
 * actually uploads afterward. Finalize independently re-verifies the real
 * Storage-reported metadata as the authoritative check (finalize-media.ts).
 */
export function validateUploadIntentInput(body: unknown): UploadIntentInput {
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
  const mimeType = parseRequiredNonEmptyString(record, "mimeType");
  const sizeBytes = parseRequiredPositiveInteger(record, "sizeBytes");

  const allowedMimeTypes = allowedMimeTypesForMediaType(mediaType) as readonly string[];
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new ApiError(
      "BAD_REQUEST",
      `"mimeType" must be one of: ${allowedMimeTypes.join(", ")} for media type "${mediaType}"`,
    );
  }

  const maxBytes = maxBytesForMediaType(mediaType);
  if (sizeBytes > maxBytes) {
    throw new ApiError(
      "BAD_REQUEST",
      `"sizeBytes" exceeds the ${maxBytes}-byte limit for media type "${mediaType}"`,
    );
  }

  return { mediaType, mimeType, sizeBytes };
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

function parseRequiredNonEmptyString(
  record: Record<string, unknown>,
  fieldName: string,
): string {
  const value = requireKey(record, fieldName);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a non-empty string`);
  }

  return value;
}

function parseRequiredPositiveInteger(
  record: Record<string, unknown>,
  fieldName: string,
): number {
  const value = requireKey(record, fieldName);

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a positive integer`);
  }

  return value;
}
