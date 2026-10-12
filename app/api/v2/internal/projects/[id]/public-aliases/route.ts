import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { supabaseInvitationAliasGateway } from "../../../../../../../lib/server/supabase/invitation-alias-repository";
import { handleAssignInvitationAliasRequest } from "../../../../../../../lib/server/routes/invitation-alias";

/**
 * POST /api/v2/internal/projects/[id]/public-aliases — staff-only
 * LAUNCH-P0-02 one-time friendly link of a published GROOM/BRIDE
 * invitation. Body `{ variant, alias? }`; without `alias` the server
 * derives the default from the PUBLISHED Snapshot. Never touches the
 * publication itself.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await handleAssignInvitationAliasRequest(
    request.headers.get("authorization"),
    id,
    () => request.json(),
    supabaseStaffAuthGateway,
    { aliases: supabaseInvitationAliasGateway },
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
