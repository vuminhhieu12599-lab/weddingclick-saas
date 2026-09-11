import type { StaffContext } from "../auth/staff-context";
import type { ProjectGateway } from "./project-gateway";
import { resolveAddonsForCreation } from "./resolve-addons";
import { resolveAssignedStaffForCreation } from "./resolve-assigned-staff";
import { resolvePackageForCreation } from "./resolve-package";
import { validateCreateProjectRequest } from "./validate-create-project-request";

/**
 * PRE-FLIGHT business validation/preview for creating one Project plus its
 * initial add-ons (Task 005). This is NOT a persistence-ready plan and its
 * resolved ids/snapshots must NEVER be treated as trusted input to the
 * future atomic database creation.
 *
 * **Not wired to any HTTP route or database write in this task.** See the
 * Task 005 final report's TRANSACTION ATOMICITY REVIEW: creating a Project
 * row plus N project_addons rows cannot be made atomic with the current
 * Foundation schema (migrations 0001–0006) through plain Supabase
 * PostgREST calls — each `.from(...).insert()` is its own transaction, and
 * no existing RPC wraps both writes in one. Building that RPC requires a
 * new migration (0007+), which is out of scope for Task 005 (DATABASE
 * IMPACT: NONE).
 *
 * TOCTOU WARNING (Task 005 Revision 1): the catalog/package/add-on/staff
 * resolution this function performs reads state at request time, outside
 * any database transaction. Between that read and a later write, an admin
 * could change a package/add-on price or name, or deactivate a package,
 * add-on, or staff profile — so the ids/prices/names resolved here can go
 * stale before anything is persisted. Task 005B's atomic creation RPC must
 * NOT accept this plan's resolved ids/snapshots as its input. Instead it
 * must accept only business intent (customerId, packageCode, addonCodes,
 * assignedStaffId, deadlineAt) and independently re-read and revalidate —
 * inside the same database transaction that performs the writes — the
 * customer, package active state and current price/name/id, each addon's
 * active state and current price/name/id, and the assigned staff's active
 * state, before creating all snapshots atomically. This function exists so
 * every other required piece of Task 005 — package/add-on/staff
 * validation, forbidden-field rejection, "never trust a client price" — is
 * implemented and unit-tested now as a request-time preview/validation
 * step, not as the source of truth the RPC persists from.
 */
export interface ProjectCreationAddonPlan {
  serviceAddonId: string;
  addonCodeSnapshot: string;
  addonNameSnapshot: string;
  priceVndSnapshot: number;
}

export interface ProjectCreationPlan {
  customerId: string;
  eventType: "WEDDING";
  servicePackageId: string;
  packageCodeSnapshot: string;
  packageNameSnapshot: string;
  basePriceVnd: number;
  addons: ProjectCreationAddonPlan[];
  assignedStaffId: string | null;
  deadlineAt: string | null;
}

export async function buildProjectCreationPlan<TClient>(
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectGateway<TClient>,
): Promise<ProjectCreationPlan> {
  const request = validateCreateProjectRequest(rawBody);

  const packageRow = await resolvePackageForCreation(
    request.packageCode,
    staff.supabase,
    gateway,
  );
  const addonRows = await resolveAddonsForCreation(
    request.addonCodes,
    staff.supabase,
    gateway,
  );
  const assignedStaffProfile = await resolveAssignedStaffForCreation(
    request.assignedStaffId,
    staff.supabase,
    gateway,
  );

  return {
    customerId: request.customerId,
    eventType: "WEDDING",
    servicePackageId: packageRow.id,
    packageCodeSnapshot: packageRow.code,
    packageNameSnapshot: packageRow.name,
    basePriceVnd: packageRow.priceVnd,
    addons: addonRows.map((addon) => ({
      serviceAddonId: addon.id,
      addonCodeSnapshot: addon.code,
      addonNameSnapshot: addon.name,
      priceVndSnapshot: addon.priceVnd,
    })),
    assignedStaffId: assignedStaffProfile ? assignedStaffProfile.id : null,
    deadlineAt: request.deadlineAt,
  };
}
