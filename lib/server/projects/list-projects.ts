import { PROJECT_STATUSES, type ProjectStatus } from "../../domain";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { parseLimit } from "../validation/pagination";
import { isValidUuid } from "../validation/uuid";
import type { ProjectGateway } from "./project-gateway";
import type { ProjectSummary } from "./project-types";

export interface ListProjectsQuery {
  limit: string | null;
  status: string | null;
  customerId: string | null;
  projectCode: string | null;
}

function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

/** List/filter-Projects use case (Task 005). */
export async function listProjects<TClient>(
  query: ListProjectsQuery,
  staff: StaffContext<TClient>,
  gateway: ProjectGateway<TClient>,
): Promise<ProjectSummary[]> {
  const limit = parseLimit(query.limit);

  let status: ProjectStatus | null = null;
  if (query.status !== null) {
    if (!isProjectStatus(query.status)) {
      throw new ApiError("BAD_REQUEST", `status must be one of: ${PROJECT_STATUSES.join(", ")}`);
    }
    status = query.status;
  }

  let customerId: string | null = null;
  if (query.customerId !== null) {
    if (!isValidUuid(query.customerId)) {
      throw new ApiError("BAD_REQUEST", "customerId must be a valid UUID");
    }
    customerId = query.customerId;
  }

  const projectCode = query.projectCode && query.projectCode.trim().length > 0
    ? query.projectCode.trim()
    : null;

  return gateway.listProjects(staff.supabase, { limit, status, customerId, projectCode });
}
