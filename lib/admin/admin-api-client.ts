import type { InvitationVariant, ProjectStatus } from "../domain";
import type { CustomerRecord } from "../server/customers/customer-types";
import type { ProjectDesignRecord } from "../server/project-design/project-design-types";
import type {
  CreateProjectEventResult,
  ProjectEventInput,
  ProjectEventRecord,
  UpdateProjectEventResult,
} from "../server/project-events/project-events-types";
import type { ProjectSummary } from "../server/projects/project-types";
import type { StaffInvitationPreviewBody } from "../server/routes/invitation-preview";
import type { StaffMeSuccessBody } from "../server/routes/staff-me";
import type { TemplateCatalogEntry } from "../server/templates/templates-types";
import type {
  SaveWeddingDetailsInput,
  SaveWeddingDetailsResult,
  WeddingDetailsRecord,
} from "../server/wedding-details/wedding-details-types";
import { AdminApiError } from "./admin-api-error";
import type { DesignAssignmentBody } from "./design-assignment";
import { getStaffAccessToken } from "./staff-session-client";

/**
 * Browser-side client for the V2 Admin UI (UI-001).
 *
 * Every function here calls an existing `/api/v2/internal/**` Route Handler
 * with the staff member's own Supabase Auth access token as a Bearer
 * credential — never a direct Supabase table query and never a service-role
 * credential (CLAUDE.md §13, docs/ARCHITECTURE.md §5).
 */

/**
 * `listProjects` has no cursor/offset pagination (lib/server/validation/pagination.ts
 * "V1 scope is deliberately simple — a bounded `limit` only"), so the Admin
 * UI requests the maximum allowed page instead of building pagination UI
 * against an API that doesn't support it. Counts/lists therefore reflect at
 * most this many of the most recently created projects — see the Dashboard
 * and Project List "known limitation" callouts.
 */
export const PROJECT_LIST_LIMIT = 100;

async function requireAccessToken(): Promise<string> {
  const token = await getStaffAccessToken();
  if (!token) {
    throw new AdminApiError(401, "Không tìm thấy phiên đăng nhập nhân sự");
  }
  return token;
}

async function requestJson<T>(
  path: string,
  accessToken: string,
  write?: { method: "PUT" | "POST"; body: unknown },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      path,
      write
        ? {
            method: write.method,
            headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
            body: JSON.stringify(write.body),
          }
        : { headers: { authorization: `Bearer ${accessToken}` } },
    );
  } catch {
    throw new AdminApiError(0, "Không thể kết nối tới máy chủ");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AdminApiError(response.status, "Phản hồi không hợp lệ từ máy chủ");
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Đã xảy ra lỗi không xác định";
    throw new AdminApiError(response.status, message);
  }

  return body as T;
}

export async function fetchStaffMe(): Promise<StaffMeSuccessBody> {
  const token = await requireAccessToken();
  return requestJson<StaffMeSuccessBody>("/api/v2/internal/me", token);
}

export interface ListProjectsFilter {
  status?: ProjectStatus;
}

export async function fetchProjects(
  filter: ListProjectsFilter = {},
): Promise<ProjectSummary[]> {
  const token = await requireAccessToken();
  const params = new URLSearchParams({ limit: String(PROJECT_LIST_LIMIT) });
  if (filter.status) {
    params.set("status", filter.status);
  }
  return requestJson<ProjectSummary[]>(`/api/v2/internal/projects?${params.toString()}`, token);
}

export async function fetchProjectById(projectId: string): Promise<ProjectSummary> {
  const token = await requireAccessToken();
  return requestJson<ProjectSummary>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}`,
    token,
  );
}

export async function fetchCustomerById(customerId: string): Promise<CustomerRecord> {
  const token = await requireAccessToken();
  return requestJson<CustomerRecord>(
    `/api/v2/internal/customers/${encodeURIComponent(customerId)}`,
    token,
  );
}

/** Read-only staff preview; signed media URLs in the result are runtime-only and never stored. */
export async function fetchStaffInvitationPreview(
  projectId: string,
  variant: InvitationVariant,
): Promise<StaffInvitationPreviewBody> {
  const token = await requireAccessToken();
  const params = new URLSearchParams({ variant });
  const body = await requestJson<{ data: StaffInvitationPreviewBody }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/preview?${params.toString()}`,
    token,
  );
  return body.data;
}

/** Complete staff template catalog (§13.1); `selectable` is server-derived. */
export async function fetchTemplateCatalog(): Promise<TemplateCatalogEntry[]> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: TemplateCatalogEntry[] }>("/api/v2/internal/templates", token);
  return body.data;
}

/** Current mutable design selection (§13.2); `null` when none is assigned yet. */
export async function fetchProjectDesign(projectId: string): Promise<ProjectDesignRecord | null> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectDesignRecord | null }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/design`,
    token,
  );
  return body.data;
}

/** Existing validated design upsert (§13.3). Draft design only — never publishes. */
export async function saveProjectDesign(
  projectId: string,
  input: DesignAssignmentBody,
): Promise<ProjectDesignRecord> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectDesignRecord }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/design`,
    token,
    { method: "PUT", body: input },
  );
  return body.data;
}

/** Canonical wedding details (Task 022); `null` when the Project has none yet. */
export async function fetchWeddingDetails(projectId: string): Promise<WeddingDetailsRecord | null> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: WeddingDetailsRecord | null }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/wedding-details`,
    token,
  );
  return body.data;
}

/** Existing full canonical Save (Task 022). Draft data only — never publishes. */
export async function saveWeddingDetails(
  projectId: string,
  input: SaveWeddingDetailsInput,
): Promise<SaveWeddingDetailsResult> {
  const token = await requireAccessToken();
  return requestJson<SaveWeddingDetailsResult>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/wedding-details`,
    token,
    { method: "PUT", body: input },
  );
}

export async function fetchProjectEvents(projectId: string): Promise<ProjectEventRecord[]> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectEventRecord[] }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/events`,
    token,
  );
  return body.data;
}

/** Existing create business action (Task 023). */
export async function createProjectEvent(
  projectId: string,
  input: ProjectEventInput,
): Promise<CreateProjectEventResult> {
  const token = await requireAccessToken();
  return requestJson<CreateProjectEventResult>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/events`,
    token,
    { method: "POST", body: input },
  );
}

/** Existing full-resource update business action (Task 023). */
export async function updateProjectEvent(
  projectId: string,
  eventId: string,
  input: ProjectEventInput,
): Promise<UpdateProjectEventResult> {
  const token = await requireAccessToken();
  return requestJson<UpdateProjectEventResult>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/events/${encodeURIComponent(eventId)}`,
    token,
    { method: "PUT", body: input },
  );
}
