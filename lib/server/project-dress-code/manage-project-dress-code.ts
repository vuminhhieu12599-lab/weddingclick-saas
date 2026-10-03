import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectDressCodeGateway, ProjectDressCodeWithSwatches } from "./project-dress-code-gateway";
import type { ProjectDressCodeRecord, ProjectDressCodeSwatchRecord } from "./project-dress-code-types";
import type { ProjectDressCodeWriteGateway } from "./project-dress-code-write-gateway";
import {
  validateCreateSwatchInput,
  validateSaveDressCodeInput,
  validateUpdateSwatchInput,
} from "./validate-dress-code-input";

/**
 * Staff Dress Code use cases (RF7 Dress Code amendment). Plain staff RLS
 * CRUD; only explicitly entered values are persisted (no default
 * description, no default colours, never inferred from design). Draft data
 * only: nothing here touches invitation versions or publish state.
 */
async function requireProject<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: Pick<ProjectDressCodeWriteGateway<TClient>, "projectExists">,
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

function requireSwatchId(rawSwatchId: string): string {
  if (!isValidUuid(rawSwatchId)) {
    throw new ApiError("BAD_REQUEST", "Swatch id must be a valid UUID");
  }
  return rawSwatchId.toLowerCase();
}

export async function getProjectDressCodeForStaff<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  writeGateway: Pick<ProjectDressCodeWriteGateway<TClient>, "projectExists">,
  readGateway: ProjectDressCodeGateway<TClient>,
): Promise<ProjectDressCodeWithSwatches | null> {
  const projectId = await requireProject(rawProjectId, staff, writeGateway);
  return readGateway.getProjectDressCode(staff.supabase, projectId);
}

export async function saveProjectDressCode<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectDressCodeWriteGateway<TClient>,
): Promise<ProjectDressCodeRecord> {
  const projectId = await requireProject(rawProjectId, staff, gateway);
  const { description } = validateSaveDressCodeInput(rawBody);
  return gateway.upsertDressCode(staff.supabase, projectId, description);
}

export async function createProjectDressCodeSwatch<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectDressCodeWriteGateway<TClient>,
): Promise<ProjectDressCodeSwatchRecord> {
  const projectId = await requireProject(rawProjectId, staff, gateway);
  const input = validateCreateSwatchInput(rawBody);
  const swatch = await gateway.insertSwatch(staff.supabase, projectId, input);
  if (swatch === null) {
    throw new ApiError("CONFLICT", "Save the Dress Code before adding swatches");
  }
  return swatch;
}

export async function updateProjectDressCodeSwatch<TClient>(
  rawProjectId: string,
  rawSwatchId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectDressCodeWriteGateway<TClient>,
): Promise<ProjectDressCodeSwatchRecord> {
  const swatchId = requireSwatchId(rawSwatchId);
  const projectId = await requireProject(rawProjectId, staff, gateway);
  const patch = validateUpdateSwatchInput(rawBody);
  const swatch = await gateway.updateSwatch(staff.supabase, projectId, swatchId, patch);
  if (swatch === null) {
    throw new ApiError("NOT_FOUND", "Swatch not found");
  }
  return swatch;
}

export async function deleteProjectDressCodeSwatch<TClient>(
  rawProjectId: string,
  rawSwatchId: string,
  staff: StaffContext<TClient>,
  gateway: ProjectDressCodeWriteGateway<TClient>,
): Promise<{ deleted: true }> {
  const swatchId = requireSwatchId(rawSwatchId);
  const projectId = await requireProject(rawProjectId, staff, gateway);
  if (!(await gateway.deleteSwatch(staff.supabase, projectId, swatchId))) {
    throw new ApiError("NOT_FOUND", "Swatch not found");
  }
  return { deleted: true };
}
