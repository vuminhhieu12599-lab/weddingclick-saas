import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectGateway } from "./project-gateway";
import type { StaffProfileRow } from "./project-types";

/**
 * Resolves and validates an optional assignedStaffId (Task 005 "ASSIGNED
 * STAFF VALIDATION").
 *
 * - null/undefined -> valid, returns null (no assigned staff is allowed).
 * - Malformed UUID -> 400.
 * - Well-formed UUID that does not resolve to an *active* ADMIN/STAFF
 *   profile -> 404 (never trusts an arbitrary auth.users UUID as a
 *   substitute for a real, active WeddingClick profile).
 *
 * Assignment is a responsibility/label only — this function does not (and
 * must not) grant any RLS/visibility change (docs/PHYSICAL_DATABASE_PLAN.md
 * §R-Q1).
 */
export async function resolveAssignedStaffForCreation<TClient>(
  rawAssignedStaffId: string | null,
  client: TClient,
  gateway: ProjectGateway<TClient>,
): Promise<StaffProfileRow | null> {
  if (rawAssignedStaffId === null) {
    return null;
  }

  if (!isValidUuid(rawAssignedStaffId)) {
    throw new ApiError("BAD_REQUEST", "assignedStaffId must be a valid UUID");
  }

  const profile = await gateway.getActiveStaffProfileById(client, rawAssignedStaffId);

  if (!profile) {
    throw new ApiError(
      "NOT_FOUND",
      "assignedStaffId does not resolve to an active WeddingClick staff profile",
    );
  }

  return profile;
}
