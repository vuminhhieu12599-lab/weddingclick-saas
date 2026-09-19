import { ACCESS_LINK_TYPES, type AccessLinkType } from "../../domain";
import { ApiError } from "../errors/api-error";
import { isValidTimestamptz } from "../validation/timestamptz";

/**
 * Parses/validates a raw POST /access-links request body (Task 026 Phase 3
 * frozen contract). Deliberately exact-shape: only `linkType` and
 * `expiresAt` are accepted — a caller-supplied `token`/`rawToken`/
 * `tokenHash`/`tokenHint`/`createdBy`/`projectId` is rejected the same way
 * any other unknown field is (never silently dropped), since none of those
 * are legal request fields at all.
 */
const ACCEPTED_FIELDS = new Set(["linkType", "expiresAt"]);

export interface IssueAccessLinkInput {
  linkType: AccessLinkType;
  expiresAt: string | null;
}

export function validateIssueAccessLinkInput(body: unknown): IssueAccessLinkInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ACCEPTED_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }

  if (!("linkType" in record)) {
    throw new ApiError("BAD_REQUEST", `"linkType" is required`);
  }

  const linkType = parseLinkType(record.linkType);
  const expiresAt = parseOptionalExpiresAt(record);

  return { linkType, expiresAt };
}

function parseLinkType(value: unknown): AccessLinkType {
  if (typeof value !== "string" || !(ACCESS_LINK_TYPES as readonly string[]).includes(value)) {
    throw new ApiError(
      "BAD_REQUEST",
      `"linkType" must be one of: ${ACCESS_LINK_TYPES.join(", ")}`,
    );
  }

  return value as AccessLinkType;
}

/**
 * `expiresAt` omitted or explicitly `null` both normalize to `null` (never
 * expires). A non-null value must be a valid RFC 3339 timestamp — a valid
 * past, exactly-now, or future timestamp is accepted; docs/DECISIONS.md D6
 * defines no TTL minimum/maximum/default and no product-level expiry bound,
 * so this validator applies none either.
 */
function parseOptionalExpiresAt(record: Record<string, unknown>): string | null {
  if (!("expiresAt" in record) || record.expiresAt === null) {
    return null;
  }

  const value = record.expiresAt;

  if (typeof value !== "string" || !isValidTimestamptz(value)) {
    throw new ApiError(
      "BAD_REQUEST",
      `"expiresAt" must be null or a valid RFC 3339 timestamp`,
    );
  }

  return value;
}
