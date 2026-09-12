import { STAFF_ROLES, type StaffRole } from "../domain";

const STAFF_ROLE_LABELS_VI: Record<StaffRole, string> = {
  ADMIN: "Quản trị viên",
  STAFF: "Nhân viên",
};

function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

/**
 * Accepts a plain string (e.g. `StaffMeSuccessBody.role`, which is typed as
 * `string` at the API boundary) and falls back to the raw value for any
 * unrecognized role rather than throwing — this is a display helper, not a
 * new authorization check.
 */
export function getStaffRoleLabel(role: string): string {
  return isStaffRole(role) ? STAFF_ROLE_LABELS_VI[role] : role;
}
