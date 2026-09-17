import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleDeleteProjectEventRequest,
  handleUpdateProjectEventRequest,
} from "../../../../../../../../lib/server/routes/project-events";
import { supabaseProjectEventsGateway } from "../../../../../../../../lib/server/supabase/project-events-repository";

/** PUT /api/v2/internal/projects/[id]/events/[eventId] — audited update (Task 023). */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id, eventId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const result = await handleUpdateProjectEventRequest(
    request.headers.get("authorization"),
    id,
    eventId,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectEventsGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}

/** DELETE /api/v2/internal/projects/[id]/events/[eventId] — audited delete (Task 023). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> },
) {
  const { id, eventId } = await params;

  const result = await handleDeleteProjectEventRequest(
    request.headers.get("authorization"),
    id,
    eventId,
    supabaseStaffAuthGateway,
    supabaseProjectEventsGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
