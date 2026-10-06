import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import type { DashboardGateway } from "../dashboard/dashboard-gateway";
import type { AdminDashboard } from "../dashboard/dashboard-types";
import { getAdminDashboard } from "../dashboard/get-admin-dashboard";

/**
 * Pure, framework-agnostic handler backing the staff admin dashboard
 * endpoint (Task 034C) — mirrors lib/server/routes/project-activity.ts.
 */

export interface ApiResult<TBody> {
  status: 200 | 401 | 403 | 500;
  body: TBody | { error: string };
}

/** GET /api/v2/internal/dashboard */
export async function handleGetAdminDashboardRequest<TClient>(
  authorizationHeader: string | null,
  authGateway: StaffAuthGateway<TClient>,
  gateway: DashboardGateway<TClient>,
  now: Date,
): Promise<ApiResult<{ data: AdminDashboard }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }
  try {
    const staff = await requireStaff(token, authGateway);
    return { status: 200, body: { data: await getAdminDashboard(staff, gateway, now) } };
  } catch (error) {
    if (error instanceof StaffAuthError && error.kind === "UNAUTHENTICATED") {
      return { status: 401, body: { error: error.message } };
    }
    if (error instanceof StaffAuthError && error.kind === "FORBIDDEN") {
      return { status: 403, body: { error: error.message } };
    }
    console.error("[handleGetAdminDashboardRequest] Unexpected error");
    return { status: 500, body: { error: "Internal server error" } };
  }
}
