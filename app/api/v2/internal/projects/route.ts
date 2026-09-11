import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleCreateProjectRequest,
  handleListProjectsRequest,
} from "../../../../../lib/server/routes/projects";
import { supabaseProjectGateway } from "../../../../../lib/server/supabase/project-repository";

/**
 * GET  /api/v2/internal/projects — list/filter Projects (Task 005, read-only).
 * POST /api/v2/internal/projects — create a Project + initial add-ons
 * (Task 005B), atomically via the create_project_with_addons database RPC.
 * See lib/server/projects/create-project.ts.
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

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const result = await handleCreateProjectRequest(
    request.headers.get("authorization"),
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
