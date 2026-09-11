import type { StaffContext } from "../auth/staff-context";
import type { ProjectGateway } from "./project-gateway";
import type { CreatedProjectRef } from "./project-types";
import { validateCreateProjectRequest } from "./validate-create-project-request";

/**
 * Create-Project use case (Task 005B).
 *
 * Deliberately does NOT use buildProjectCreationPlan() — that function is a
 * request-time pre-flight preview only (see its own doc comment) and its
 * resolved ids/snapshots must never be treated as trusted persistence
 * input. This use case instead validates only business intent
 * (validateCreateProjectRequest, unchanged from Task 005 — it already
 * rejects every forbidden client-supplied field, including createdBy,
 * status, and every commercial snapshot) and hands that intent straight to
 * the atomic `create_project_with_addons` RPC via the gateway. All
 * authoritative resolution/validation (customer, package, add-ons,
 * assigned staff, active-state, current price/name) happens inside that
 * RPC's own database transaction.
 *
 * `staff.userId` is never read here and never passed to the gateway —
 * `created_by` is set inside the RPC from `auth.uid()`, which resolves from
 * the same JWT the staff-scoped client already carries.
 */
export async function createProject<TClient>(
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectGateway<TClient>,
): Promise<CreatedProjectRef> {
  const request = validateCreateProjectRequest(rawBody);

  return gateway.createProject(staff.supabase, {
    customerId: request.customerId,
    packageCode: request.packageCode,
    addonCodes: request.addonCodes,
    assignedStaffId: request.assignedStaffId,
    deadlineAt: request.deadlineAt,
  });
}
