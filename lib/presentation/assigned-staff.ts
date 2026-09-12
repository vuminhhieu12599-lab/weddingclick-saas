import type { StaffSummary } from "../server/projects/project-types";

const UNASSIGNED_LABEL = "Chưa phân công";

export function getAssignedStaffLabel(staff: StaffSummary | null): string {
  return staff ? staff.displayName : UNASSIGNED_LABEL;
}
