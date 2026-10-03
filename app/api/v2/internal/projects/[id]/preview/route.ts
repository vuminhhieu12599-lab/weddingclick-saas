import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { supabaseStaffInvitationPreviewDependencies } from "../../../../../../../lib/server/invitation-preview/staff-invitation-preview-supabase";
import { handleGetStaffInvitationPreviewRequest } from "../../../../../../../lib/server/routes/invitation-preview";

/**
 * GET /api/v2/internal/projects/[id]/preview?variant= — staff-only,
 * read-only invitation preview built by the frozen
 * `buildStaffInvitationPreview` over the staff-scoped production wiring.
 * Never publishes, never writes `invitation_versions`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleGetStaffInvitationPreviewRequest(
    request.headers.get("authorization"),
    id,
    new URL(request.url).searchParams.get("variant"),
    supabaseStaffAuthGateway,
    supabaseStaffInvitationPreviewDependencies,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
