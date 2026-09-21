import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleApplyIntakeSubmissionRequest } from "../../../../../../../../../lib/server/routes/intake";
import { supabaseIntakeStaffGateway } from "../../../../../../../../../lib/server/supabase/intake-staff-repository";

/**
 * POST /api/v2/internal/projects/[id]/intake-submissions/[submissionId]/apply
 * (Task 027 Phase 2). Frozen no-body contract: no request body — this route
 * never reads one at all. The exact stored immutable submission snapshot is
 * the only apply source.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
) {
  const { id, submissionId } = await params;

  const result = await handleApplyIntakeSubmissionRequest(
    request.headers.get("authorization"),
    id,
    submissionId,
    supabaseStaffAuthGateway,
    supabaseIntakeStaffGateway,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
