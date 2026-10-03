import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleDeleteProjectTimelineItemRequest,
  handleUpdateProjectTimelineItemRequest,
} from "../../../../../../../../lib/server/routes/project-timeline";
import { supabaseProjectTimelineWriteGateway } from "../../../../../../../../lib/server/supabase/project-timeline-repository";

/** PATCH /api/v2/internal/projects/[id]/timeline/[itemId] — partial update (time/label/sortOrder). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const result = await handleUpdateProjectTimelineItemRequest(
    request.headers.get("authorization"),
    id,
    itemId,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectTimelineWriteGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}

/** DELETE /api/v2/internal/projects/[id]/timeline/[itemId] */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const result = await handleDeleteProjectTimelineItemRequest(
    request.headers.get("authorization"),
    id,
    itemId,
    supabaseStaffAuthGateway,
    supabaseProjectTimelineWriteGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}
