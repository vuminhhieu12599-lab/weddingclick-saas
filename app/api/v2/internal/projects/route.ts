import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../lib/server/auth/staff-auth-gateway";
import { handleListProjectsRequest } from "../../../../../lib/server/routes/projects";
import { supabaseProjectGateway } from "../../../../../lib/server/supabase/project-repository";

/**
 * GET /api/v2/internal/projects — list/filter Projects (Task 005, read-only).
 *
 * There is deliberately no POST here — see
 * lib/server/projects/build-project-creation-plan.ts and the Task 005 final
 * report's TRANSACTION ATOMICITY REVIEW.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  const result = await handleListProjectsRequest(
    request.headers.get("authorization"),
    {
      limit: url.searchParams.get("limit"),
      status: url.searchParams.get("status"),
      customerId: url.searchParams.get("customerId"),
      projectCode: url.searchParams.get("projectCode"),
    },
    supabaseStaffAuthGateway,
    supabaseProjectGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
