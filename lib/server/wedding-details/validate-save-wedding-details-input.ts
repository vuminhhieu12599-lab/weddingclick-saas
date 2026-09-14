import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { SaveWeddingDetailsInput } from "./wedding-details-types";

/**
 * Defensive app-layer cap on free-form text fields. Not a DB constraint —
 * migration 0008 deliberately leaves these columns unbounded TEXT
 * (docs/PHYSICAL_DATABASE_PLAN.md §2.7) — this exists only to reject
 * obviously abusive payloads before they reach the database. A low-risk
 * implementation detail (CLAUDE.md §23), not a business rule.
 */
const MAX_FIELD_LENGTH = 20000;

const TEXT_FIELDS = [
  "groomName",
  "brideName",
  "groomFather",
  "groomMother",
  "brideFather",
  "brideMother",
  "groomFamilyAddress",
  "brideFamilyAddress",
  "invitationMessage",
  "loveStory",
  "lunarDateDisplay",
  "additionalNote",
  "groomBankName",
  "groomBankAccountName",
  "groomBankAccountNumber",
  "brideBankName",
  "brideBankAccountName",
  "brideBankAccountNumber",
] as const;

const UUID_FIELDS = ["groomBankQrMediaId", "brideBankQrMediaId"] as const;

/**
 * Fields the client must never be able to set on a wedding_details Save —
 * server-owned per migration 0008 (CLAUDE.md §2 "no unknown keys" / task
 * spec §4). Present at all (even with a server-matching value) -> reject.
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

const ALL_ACCEPTED_FIELDS = new Set<string>([...TEXT_FIELDS, ...UUID_FIELDS]);

/**
 * Parses/validates a raw PUT /api/v2/internal/projects/[id]/wedding-details
 * body into a safe SaveWeddingDetailsInput (Task 022 §4).
 *
 * This is a FULL canonical Save, not field-level autosave — every editable
 * column must be present (nullable, so `null` is an explicit "clear this
 * field", but a missing key is rejected rather than silently defaulted).
 */
export function validateSaveWeddingDetailsInput(body: unknown): SaveWeddingDetailsInput {
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

  const result = {} as SaveWeddingDetailsInput;

  for (const field of TEXT_FIELDS) {
    result[field] = parseRequiredOptionalString(record, field);
  }

  for (const field of UUID_FIELDS) {
    result[field] = parseRequiredOptionalUuid(record, field);
  }

  return result;
}

function parseRequiredOptionalString(
  record: Record<string, unknown>,
  fieldName: keyof SaveWeddingDetailsInput,
): string | null {
  if (!(fieldName in record)) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" is required (use null to clear it)`);
  }

  const value = record[fieldName];

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

function parseRequiredOptionalUuid(
  record: Record<string, unknown>,
  fieldName: keyof SaveWeddingDetailsInput,
): string | null {
  if (!(fieldName in record)) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" is required (use null to clear it)`);
  }

  const value = record[fieldName];

  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new ApiError("BAD_REQUEST", `"${fieldName}" must be a valid UUID or null`);
  }

  return value;
}
