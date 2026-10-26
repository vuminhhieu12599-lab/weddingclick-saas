import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import { supabaseConfirmReviewApprovalDependencies } from "../../../../../../../../lib/server/invitation-review/invitation-review-supabase";
import { handleConfirmReviewApprovalRequest } from "../../../../../../../../lib/server/routes/invitation-review";

/**
 * POST /api/v2/internal/projects/[id]/review/approvals — TE-06 staff
 * approval on behalf of the customer. Body: `{ invitationVersionId,
 * expectedCurrentReviewVersionId, channel, note }` only; the confirming
 * staff member is the authenticated session, never the body. Records one
 * STAFF `APPROVAL` row for that exact current REVIEW version. Never
 * creates a review version and never changes publication state.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleConfirmReviewApprovalRequest(
    request.headers.get("authorization"),
    id,
    () => request.json(),
    supabaseStaffAuthGateway,
    supabaseConfirmReviewApprovalDependencies,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
