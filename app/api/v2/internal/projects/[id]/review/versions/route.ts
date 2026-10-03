import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import { supabaseCreateReviewVersionDependencies } from "../../../../../../../../lib/server/invitation-review/invitation-review-supabase";
import { handleCreateReviewVersionRequest } from "../../../../../../../../lib/server/routes/invitation-review";

/**
 * POST /api/v2/internal/projects/[id]/review/versions — staff-only Task
 * 030 REVIEW snapshot creation. Body: `{ variant,
 * expectedCurrentReviewVersionId }` only; the Snapshot, template version
 * and renderer key are derived server-side. Never publishes.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleCreateReviewVersionRequest(
    request.headers.get("authorization"),
    id,
    () => request.json(),
    supabaseStaffAuthGateway,
    supabaseCreateReviewVersionDependencies,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
