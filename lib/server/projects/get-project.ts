import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectGateway } from "./project-gateway";
import type { ProjectSummary } from "./project-types";

/** Get-Project-by-ID use case (Task 005). */
export async function getProjectById<TClient>(
  rawId: string,
  staff: StaffContext<TClient>,
  gateway: ProjectGateway<TClient>,
): Promise<ProjectSummary> {
  if (!isValidUuid(rawId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const project = await gateway.getProjectById(staff.supabase, rawId);

  if (!project) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  return project;
}
