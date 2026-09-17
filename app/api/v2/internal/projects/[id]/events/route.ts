import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleCreateProjectEventRequest,
  handleListProjectEventsRequest,
} from "../../../../../../../lib/server/routes/project-events";
import { supabaseProjectEventsGateway } from "../../../../../../../lib/server/supabase/project-events-repository";

/** GET /api/v2/internal/projects/[id]/events — list project events (Task 023). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleListProjectEventsRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseProjectEventsGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}

/** POST /api/v2/internal/projects/[id]/events — audited create (Task 023). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const result = await handleCreateProjectEventRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectEventsGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
