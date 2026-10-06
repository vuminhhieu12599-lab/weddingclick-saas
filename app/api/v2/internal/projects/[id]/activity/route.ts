import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleListProjectActivityRequest } from "../../../../../../../lib/server/routes/project-activity";
import { supabaseProjectActivityGateway } from "../../../../../../../lib/server/supabase/project-activity-repository";

/** GET /api/v2/internal/projects/[id]/activity?cursor= — newest-first staff Activity history (Task 034B). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleListProjectActivityRequest(
    request.headers.get("authorization"),
    id,
    new URL(request.url).searchParams.get("cursor"),
    supabaseStaffAuthGateway,
    supabaseProjectActivityGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}
