import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleRotateAccessLinkRequest } from "../../../../../../../../../lib/server/routes/access-links";
import { supabaseAccessLinkStaffGateway } from "../../../../../../../../../lib/server/supabase/access-link-staff-repository";

/**
 * POST /api/v2/internal/projects/[id]/access-links/[linkId]/rotate (Task 026
 * Phase 3). Frozen contract: no request body — every mutation input is
 * server-generated, so this route never reads the request body at all.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const { id, linkId } = await params;

  const result = await handleRotateAccessLinkRequest(
    request.headers.get("authorization"),
    id,
    linkId,
    supabaseStaffAuthGateway,
    supabaseAccessLinkStaffGateway,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
