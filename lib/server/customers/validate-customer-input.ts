import { ApiError } from "../errors/api-error";
import type { CreateCustomerInput } from "./customer-types";

const MAX_DISPLAY_NAME_LENGTH = 200;

/**
 * Parses/validates a raw POST /api/v2/internal/customers body into a safe
 * CreateCustomerInput (Task 005 "CUSTOMERS" input rules).
 *
 * Deliberately does not accept `createdBy` from the request body at all —
 * even if present, it is ignored here; the use case always sets it from the
 * verified StaffContext (CLAUDE.md "trust client-supplied created_by").
 *
 * Does not enforce phone/email uniqueness — DB design explicitly permits a
 * shared family phone/email (docs/PHYSICAL_DATABASE_PLAN.md §2.2).
 */
export function validateCreateCustomerInput(body: unknown): CreateCustomerInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;

  const displayName = record.displayName;
  if (typeof displayName !== "string") {
    throw new ApiError("BAD_REQUEST", "displayName is required and must be a string");
  }

  const trimmedDisplayName = displayName.trim();
  if (trimmedDisplayName.length < 1 || trimmedDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new ApiError(
      "BAD_REQUEST",
      `displayName must be between 1 and ${MAX_DISPLAY_NAME_LENGTH} characters`,
    );
  }

  const phone = parseOptionalString(record.phone, "phone");
  const email = parseOptionalString(record.email, "email");
  const contactNote = parseOptionalString(record.contactNote, "contactNote");

  return {
    displayName: trimmedDisplayName,
    phone,
    email,
    contactNote,
  };
}

function parseOptionalString(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `${fieldName} must be a string when provided`);
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
