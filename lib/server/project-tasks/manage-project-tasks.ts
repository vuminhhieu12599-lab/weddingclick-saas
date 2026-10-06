import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { AssignableStaffRecord, ProjectTaskRecord } from "./project-task-types";
import type { ProjectTasksGateway } from "./project-tasks-gateway";
import { validateCreateProjectTaskInput, validateUpdateProjectTaskInput } from "./validate-project-task-input";

/**
 * Staff Project Tasks use cases (Task 034A). Plain staff RLS CRUD on
 * `project_tasks` — lightweight operational data with no activity type in
 * the frozen Activity Union (docs/API_CONTRACT.md §6), so nothing here logs
 * activity. Task assignment never touches `projects.assigned_staff_id`, and
 * nothing here touches Project lifecycle, invitations, customers or guests.
 */
async function requireProject<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: Pick<ProjectTasksGateway<TClient>, "projectExists">,
): Promise<string> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const projectId = rawProjectId.toLowerCase();
  if (!(await gateway.projectExists(staff.supabase, projectId))) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }
  return projectId;
}

function requireTaskId(rawTaskId: string): string {
  if (!isValidUuid(rawTaskId)) {
    throw new ApiError("BAD_REQUEST", "Task id must be a valid UUID");
  }
  return rawTaskId.toLowerCase();
}

/** A non-null assignee must be an existing, active STAFF/ADMIN profile. */
async function requireAssignableStaff<TClient>(
  assignedStaffId: string | null | undefined,
  staff: StaffContext<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<void> {
  if (assignedStaffId === null || assignedStaffId === undefined) return;
  if (!(await gateway.isActiveStaffProfile(staff.supabase, assignedStaffId))) {
    throw new ApiError("NOT_FOUND", "assignedStaffId does not resolve to an active WeddingClick staff profile");
  }
}

export async function listProjectTasks<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<ProjectTaskRecord[]> {
  const projectId = await requireProject(rawProjectId, staff, gateway);
  return gateway.listProjectTasks(staff.supabase, projectId);
}

export async function listAssignableStaff<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<AssignableStaffRecord[]> {
  await requireProject(rawProjectId, staff, gateway);
  return gateway.listAssignableStaff(staff.supabase);
}

export async function createProjectTask<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<ProjectTaskRecord> {
  const projectId = await requireProject(rawProjectId, staff, gateway);
  const input = validateCreateProjectTaskInput(rawBody);
  await requireAssignableStaff(input.assignedStaffId, staff, gateway);
  return gateway.insertProjectTask(staff.supabase, projectId, input);
}

export async function updateProjectTask<TClient>(
  rawProjectId: string,
  rawTaskId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<ProjectTaskRecord> {
  const taskId = requireTaskId(rawTaskId);
  const projectId = await requireProject(rawProjectId, staff, gateway);
  const patch = validateUpdateProjectTaskInput(rawBody);
  await requireAssignableStaff(patch.assignedStaffId, staff, gateway);
  const updated = await gateway.updateProjectTask(staff.supabase, projectId, taskId, patch);
  if (updated === null) {
    throw new ApiError("NOT_FOUND", "Task not found");
  }
  return updated;
}

export async function deleteProjectTask<TClient>(
  rawProjectId: string,
  rawTaskId: string,
  staff: StaffContext<TClient>,
  gateway: ProjectTasksGateway<TClient>,
): Promise<{ deleted: true }> {
  const taskId = requireTaskId(rawTaskId);
  const projectId = await requireProject(rawProjectId, staff, gateway);
  if (!(await gateway.deleteProjectTask(staff.supabase, projectId, taskId))) {
    throw new ApiError("NOT_FOUND", "Task not found");
  }
  return { deleted: true };
}
