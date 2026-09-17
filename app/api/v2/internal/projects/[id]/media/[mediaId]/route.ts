import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleDeleteProjectMediaRequest,
  handleUpdateProjectMediaRequest,
} from "../../../../../../../../lib/server/routes/project-media";
import { supabaseProjectMediaGateway } from "../../../../../../../../lib/server/supabase/project-media-repository";

/** PATCH /api/v2/internal/projects/[id]/media/[mediaId] (Task 024 Phase 3) — metadata patch. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { id, mediaId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const result = await handleUpdateProjectMediaRequest(
    request.headers.get("authorization"),
    id,
    mediaId,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectMediaGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}

/** DELETE /api/v2/internal/projects/[id]/media/[mediaId] (Task 024 Phase 3) — safe delete. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { id, mediaId } = await params;

  const result = await handleDeleteProjectMediaRequest(
    request.headers.get("authorization"),
    id,
    mediaId,
    supabaseStaffAuthGateway,
    supabaseProjectMediaGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
