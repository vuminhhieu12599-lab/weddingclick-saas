import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleListProjectMediaRequest } from "../../../../../../../lib/server/routes/project-media";
import { supabaseProjectMediaGateway } from "../../../../../../../lib/server/supabase/project-media-repository";

/** GET /api/v2/internal/projects/[id]/media (Task 024 Phase 3) — list project media. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleListProjectMediaRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseProjectMediaGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
