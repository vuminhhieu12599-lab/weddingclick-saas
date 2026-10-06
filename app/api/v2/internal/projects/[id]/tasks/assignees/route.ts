import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleListTaskAssigneesRequest } from "../../../../../../../../lib/server/routes/project-tasks";
import { supabaseProjectTasksGateway } from "../../../../../../../../lib/server/supabase/project-tasks-repository";

/** GET /api/v2/internal/projects/[id]/tasks/assignees — active staff choices (id + display name only). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleListTaskAssigneesRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseProjectTasksGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}
