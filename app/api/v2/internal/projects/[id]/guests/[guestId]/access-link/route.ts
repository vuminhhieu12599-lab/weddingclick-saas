import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleIssueGuestLinkRequest } from "../../../../../../../../../lib/server/routes/guest-links";
import { supabaseGuestLinkStaffGateway } from "../../../../../../../../../lib/server/supabase/guest-link-staff-repository";

/**
 * POST /api/v2/internal/projects/[id]/guests/[guestId]/access-link (Task
 * 033B1). Staff Bearer session only. Body `{ "action": "ISSUE" | "REGENERATE" }`;
 * the response carries the personalized `/i/[slug]/g/[token]` path once.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; guestId: string }> },
) {
  const { id, guestId } = await params;

  const result = await handleIssueGuestLinkRequest(
    request.headers.get("authorization"),
    id,
    guestId,
    () => request.json(),
    supabaseStaffAuthGateway,
    supabaseGuestLinkStaffGateway,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
