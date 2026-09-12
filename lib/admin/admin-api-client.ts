import type { ProjectStatus } from "../domain";
import type { CustomerRecord } from "../server/customers/customer-types";
import type { ProjectSummary } from "../server/projects/project-types";
import type { StaffMeSuccessBody } from "../server/routes/staff-me";
import { AdminApiError } from "./admin-api-error";
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

async function requestJson<T>(path: string, accessToken: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
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
