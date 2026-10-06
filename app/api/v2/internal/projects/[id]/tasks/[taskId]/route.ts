import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleDeleteProjectTaskRequest,
  handleUpdateProjectTaskRequest,
} from "../../../../../../../../lib/server/routes/project-tasks";
import { supabaseProjectTasksGateway } from "../../../../../../../../lib/server/supabase/project-tasks-repository";

/** PATCH /api/v2/internal/projects/[id]/tasks/[taskId] — partial update (title/status/dueAt/assignedStaffId/sortOrder). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const result = await handleUpdateProjectTaskRequest(
    request.headers.get("authorization"),
    id,
    taskId,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectTasksGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}

/** DELETE /api/v2/internal/projects/[id]/tasks/[taskId] */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const result = await handleDeleteProjectTaskRequest(
    request.headers.get("authorization"),
    id,
    taskId,
    supabaseStaffAuthGateway,
    supabaseProjectTasksGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}
