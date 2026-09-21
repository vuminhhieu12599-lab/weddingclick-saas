import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectDesignGateway } from "./project-design-gateway";
import type { ProjectDesignRecord } from "./project-design-types";

/**
 * Get-Project-Design-by-Project use case (Task 028, DIRECT RLS SELECT per
 * API_CONTRACT.md §8 "project_design get/upsert").
 *
 * If the Project exists but has no project_design row yet, returns `null`
 * (a Project may exist before design is configured). If the Project itself
 * does not exist, throws NOT_FOUND.
 *
 * Does not join or duplicate template/catalog metadata (Task 028 closure
 * §10) — the caller resolves `templateVersionId` against the complete
 * GET /templates catalog separately.
 */
export async function getProjectDesignByProjectId<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: ProjectDesignGateway<TClient>,
): Promise<ProjectDesignRecord | null> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const project = await gateway.getProjectForDesign(staff.supabase, rawProjectId);
  if (!project) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  return gateway.getCurrentProjectDesign(staff.supabase, rawProjectId);
}
