import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../../../lib/server/auth/staff-auth-gateway";
import { supabaseReviewVersionPreviewDependencies } from "../../../../../../../../../../lib/server/invitation-review/invitation-review-supabase";
import { handleGetReviewVersionPreviewRequest } from "../../../../../../../../../../lib/server/routes/invitation-review";

/**
 * GET /api/v2/internal/projects/[id]/review/versions/[versionId]/preview —
 * staff-only render of one persisted, immutable REVIEW Snapshot with its
 * pinned renderer. Never rebuilds from the mutable draft.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await params;

  const result = await handleGetReviewVersionPreviewRequest(
    request.headers.get("authorization"),
    id,
    versionId,
    supabaseStaffAuthGateway,
    supabaseReviewVersionPreviewDependencies,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
