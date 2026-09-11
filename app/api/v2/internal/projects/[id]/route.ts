import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../lib/server/auth/staff-auth-gateway";
import { handleGetProjectRequest } from "../../../../../../lib/server/routes/projects";
import { supabaseProjectGateway } from "../../../../../../lib/server/supabase/project-repository";

/** GET /api/v2/internal/projects/[id] — get one Project by id (Task 005). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleGetProjectRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseProjectGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
