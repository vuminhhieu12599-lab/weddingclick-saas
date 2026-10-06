import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../lib/server/auth/staff-auth-gateway";
import { handleGetAdminDashboardRequest } from "../../../../../lib/server/routes/admin-dashboard";
import { supabaseDashboardGateway } from "../../../../../lib/server/supabase/dashboard-repository";

/** GET /api/v2/internal/dashboard — staff operational dashboard aggregates (Task 034C). */
export async function GET(request: Request) {
  const result = await handleGetAdminDashboardRequest(
    request.headers.get("authorization"),
    supabaseStaffAuthGateway,
    supabaseDashboardGateway,
    new Date(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
