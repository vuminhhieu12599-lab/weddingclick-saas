import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { supabaseProjectReviewStateDependencies } from "../../../../../../../lib/server/invitation-review/invitation-review-supabase";
import { handleGetProjectReviewStateRequest } from "../../../../../../../lib/server/routes/invitation-review";

/**
 * GET /api/v2/internal/projects/[id]/review — staff-only Task 030 read
 * model: required variants, current REVIEW versions, approval state.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleGetProjectReviewStateRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseProjectReviewStateDependencies,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
