import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleCreateProjectTimelineItemRequest,
  handleListProjectTimelineRequest,
} from "../../../../../../../lib/server/routes/project-timeline";
import {
  supabaseProjectTimelineGateway,
  supabaseProjectTimelineWriteGateway,
} from "../../../../../../../lib/server/supabase/project-timeline-repository";

/** GET /api/v2/internal/projects/[id]/timeline — ordered Timeline items. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleListProjectTimelineRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseProjectTimelineWriteGateway,
    supabaseProjectTimelineGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}

/** POST /api/v2/internal/projects/[id]/timeline — create one Timeline item. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const result = await handleCreateProjectTimelineItemRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectTimelineWriteGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}
