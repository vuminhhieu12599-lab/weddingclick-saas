import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleIssueAccessLinkRequest } from "../../../../../../../lib/server/routes/access-links";
import { supabaseAccessLinkStaffGateway } from "../../../../../../../lib/server/supabase/access-link-staff-repository";

/** POST /api/v2/internal/projects/[id]/access-links (Task 026 Phase 3) — staff-issued access link. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const result = await handleIssueAccessLinkRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseAccessLinkStaffGateway,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
