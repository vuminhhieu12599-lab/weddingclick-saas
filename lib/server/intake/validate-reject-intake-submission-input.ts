import { ApiError } from "../errors/api-error";

/**
 * Parses/validates a raw POST .../intake-submissions/[submissionId]/reject
 * request body (Task 027 Phase 2 frozen contract §5). Exactly one optional
 * field is accepted:
 *
 *   { "staffNote": "optional string or null" }
 *
 * `staffNote` omitted or explicitly `null` both normalize to `null` (mirrors
 * validate-issue-access-link-input.ts's `expiresAt` optional-field
 * convention). No business max-length is invented here — `staff_note` is an
 * unbounded TEXT column (migration 0015) with no existing shared/frozen
 * length constraint to reuse (frozen Task 027 Phase 2 contract §5: "do not
 * invent arbitrary business max-length unless an existing shared/frozen
 * constraint already exists").
 */
const ACCEPTED_FIELDS = new Set(["staffNote"]);

export function validateRejectIntakeSubmissionInput(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ACCEPTED_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }

  if (!("staffNote" in record) || record.staffNote === null) {
    return null;
  }

  const value = record.staffNote;

  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"staffNote" must be a string or null`);
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
