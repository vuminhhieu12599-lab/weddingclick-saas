import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleListIntakeSubmissionsRequest } from "../../../../../../../lib/server/routes/intake";
import { supabaseIntakeStaffGateway } from "../../../../../../../lib/server/supabase/intake-staff-repository";

/** GET /api/v2/internal/projects/[id]/intake-submissions — list intake submissions (Task 027 Phase 2). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleListIntakeSubmissionsRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseIntakeStaffGateway,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
