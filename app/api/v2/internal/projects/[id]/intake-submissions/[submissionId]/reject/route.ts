import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleRejectIntakeSubmissionRequest } from "../../../../../../../../../lib/server/routes/intake";
import { supabaseIntakeStaffGateway } from "../../../../../../../../../lib/server/supabase/intake-staff-repository";

/**
 * POST /api/v2/internal/projects/[id]/intake-submissions/[submissionId]/reject
 * (Task 027 Phase 2).
 *
 * The request body is deliberately NOT read here (Task 027 Phase 2
 * Independent Review Patch 1, Finding A) — `request.json` is passed as a
 * lazy, uninvoked callback so the handler reads it only after
 * `requireStaff` has already succeeded. Reading it eagerly here would let a
 * malformed-JSON body preempt the frozen
 * transport/staff-authorization/body error precedence.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; submissionId: string }> },
) {
  const { id, submissionId } = await params;

  const result = await handleRejectIntakeSubmissionRequest(
    request.headers.get("authorization"),
    id,
    submissionId,
    () => request.json(),
    supabaseStaffAuthGateway,
    supabaseIntakeStaffGateway,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
