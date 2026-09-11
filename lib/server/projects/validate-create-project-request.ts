import { ApiError } from "../errors/api-error";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Shape validated from a raw POST /api/v2/internal/projects body (Task 005
 * "PROJECT CREATION"). Represents business intent only — never raw database
 * ownership/pricing fields.
 */
export interface CreateProjectRequest {
  customerId: string;
  packageCode: string;
  addonCodes: string[];
  assignedStaffId: string | null;
  deadlineAt: string | null;
}

/**
 * Fields the client must never be able to set. Present at all (even with a
 * value equal to what the server would have computed) -> reject, so a
 * client cannot probe/rely on any of these ever being silently accepted.
 */
const FORBIDDEN_FIELDS = [
  "projectCode",
  "project_code",
  "basePriceVnd",
  "base_price_vnd",
  "addonTotalVnd",
  "addon_total_vnd",
  "totalPriceVnd",
  "total_price_vnd",
  "paymentStatus",
  "payment_status",
  "paidAt",
  "paid_at",
  "createdBy",
  "created_by",
  "status",
  "eventType",
  "event_type",
  "servicePackageId",
  "service_package_id",
] as const;

export function validateCreateProjectRequest(body: unknown): CreateProjectRequest {
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

  const customerId = record.customerId;
  if (typeof customerId !== "string" || !isValidUuid(customerId)) {
    throw new ApiError("BAD_REQUEST", "customerId is required and must be a valid UUID");
  }

  const packageCode = record.packageCode;
  if (typeof packageCode !== "string" || packageCode.length === 0) {
    throw new ApiError("BAD_REQUEST", "packageCode is required and must be a string");
  }

  const addonCodes = parseAddonCodes(record.addonCodes);
  const assignedStaffId = parseOptionalUuid(record.assignedStaffId, "assignedStaffId");
  const deadlineAt = parseOptionalIsoDate(record.deadlineAt, "deadlineAt");

  return { customerId, packageCode, addonCodes, assignedStaffId, deadlineAt };
}

function parseAddonCodes(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new ApiError("BAD_REQUEST", "addonCodes must be an array of strings when provided");
  }

  return value;
}

function parseOptionalUuid(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new ApiError("BAD_REQUEST", `${fieldName} must be a valid UUID when provided`);
  }

  return value;
}

function parseOptionalIsoDate(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string" || !isValidTimestamptz(value)) {
    throw new ApiError(
      "BAD_REQUEST",
      `${fieldName} must be a timezone-aware RFC 3339 timestamp (e.g. "2026-09-20T17:00:00+07:00") when provided`,
    );
  }

  return value;
}
