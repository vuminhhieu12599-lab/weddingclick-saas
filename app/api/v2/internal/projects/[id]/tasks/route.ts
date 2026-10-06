import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleCreateProjectTaskRequest,
  handleListProjectTasksRequest,
} from "../../../../../../../lib/server/routes/project-tasks";
import { supabaseProjectTasksGateway } from "../../../../../../../lib/server/supabase/project-tasks-repository";

/** GET /api/v2/internal/projects/[id]/tasks — ordered staff operational tasks (Task 034A). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleListProjectTasksRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseProjectTasksGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}

/** POST /api/v2/internal/projects/[id]/tasks — create one task (status always TODO). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const result = await handleCreateProjectTaskRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectTasksGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}
