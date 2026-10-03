import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectTimelineGateway } from "./project-timeline-gateway";
import type { ProjectTimelineItemRecord } from "./project-timeline-types";
import type { ProjectTimelineWriteGateway } from "./project-timeline-write-gateway";
import { validateCreateTimelineItemInput, validateUpdateTimelineItemInput } from "./validate-timeline-item-input";

/**
 * Staff Timeline use cases (RF7 Timeline amendment). Plain staff RLS CRUD on
 * `project_timeline_items` — canonical structured content, never derived from
 * project events, no fixed item count. Draft data only: nothing here touches
 * invitation versions or publish state.
 */
async function requireProject<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: Pick<ProjectTimelineWriteGateway<TClient>, "projectExists">,
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

function requireItemId(rawItemId: string): string {
  if (!isValidUuid(rawItemId)) {
    throw new ApiError("BAD_REQUEST", "Timeline item id must be a valid UUID");
  }
  return rawItemId.toLowerCase();
}

export async function listProjectTimeline<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  writeGateway: Pick<ProjectTimelineWriteGateway<TClient>, "projectExists">,
  readGateway: ProjectTimelineGateway<TClient>,
): Promise<ProjectTimelineItemRecord[]> {
  const projectId = await requireProject(rawProjectId, staff, writeGateway);
  return readGateway.listProjectTimelineItems(staff.supabase, projectId);
}

export async function createProjectTimelineItem<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectTimelineWriteGateway<TClient>,
): Promise<ProjectTimelineItemRecord> {
  const projectId = await requireProject(rawProjectId, staff, gateway);
  const input = validateCreateTimelineItemInput(rawBody);
  return gateway.insertTimelineItem(staff.supabase, projectId, input);
}

export async function updateProjectTimelineItem<TClient>(
  rawProjectId: string,
  rawItemId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectTimelineWriteGateway<TClient>,
): Promise<ProjectTimelineItemRecord> {
  const itemId = requireItemId(rawItemId);
  const projectId = await requireProject(rawProjectId, staff, gateway);
  const patch = validateUpdateTimelineItemInput(rawBody);
  const updated = await gateway.updateTimelineItem(staff.supabase, projectId, itemId, patch);
  if (updated === null) {
    throw new ApiError("NOT_FOUND", "Timeline item not found");
  }
  return updated;
}

export async function deleteProjectTimelineItem<TClient>(
  rawProjectId: string,
  rawItemId: string,
  staff: StaffContext<TClient>,
  gateway: ProjectTimelineWriteGateway<TClient>,
): Promise<{ deleted: true }> {
  const itemId = requireItemId(rawItemId);
  const projectId = await requireProject(rawProjectId, staff, gateway);
  if (!(await gateway.deleteTimelineItem(staff.supabase, projectId, itemId))) {
    throw new ApiError("NOT_FOUND", "Timeline item not found");
  }
  return { deleted: true };
}
