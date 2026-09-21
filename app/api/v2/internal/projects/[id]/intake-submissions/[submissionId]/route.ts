import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleGetIntakeSubmissionRequest } from "../../../../../../../../lib/server/routes/intake";
import { supabaseIntakeStaffGateway } from "../../../../../../../../lib/server/supabase/intake-staff-repository";

/** GET /api/v2/internal/projects/[id]/intake-submissions/[submissionId] — detail (Task 027 Phase 2). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
) {
  const { id, submissionId } = await params;

  const result = await handleGetIntakeSubmissionRequest(
    request.headers.get("authorization"),
    id,
    submissionId,
    supabaseStaffAuthGateway,
    supabaseIntakeStaffGateway,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
