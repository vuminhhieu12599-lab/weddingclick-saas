import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ReassignStaffInput } from "./project-lifecycle-types";

const ACCEPTED_FIELDS = new Set(["assignedStaffId"]);

/**
 * Parses/validates a raw PATCH /assignment request body (Task 025 Phase 2
 * task spec §1/§5). `assignedStaffId` is required even when its value is
 * `null` (null means unassign) — a missing key is rejected rather than
 * silently defaulted. Deliberately does NOT precheck whether a non-null
 * target profile is active/STAFF-or-ADMIN — that invariant (PL009) is the
 * exclusive authority of `reassign_project_staff`.
 */
export function validateReassignStaffInput(body: unknown): ReassignStaffInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ACCEPTED_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }

  if (!("assignedStaffId" in record)) {
    throw new ApiError("BAD_REQUEST", `"assignedStaffId" is required`);
  }

  const value = record.assignedStaffId;

  if (value === null) {
    return { assignedStaffId: null };
  }

  if (typeof value !== "string" || !isValidUuid(value)) {
    throw new ApiError("BAD_REQUEST", `"assignedStaffId" must be a UUID or null`);
  }

  return { assignedStaffId: value };
}
