import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleListAccessLinksRequest } from "../../../../../../../lib/server/routes/access-link-inventory";
import { handleIssueAccessLinkRequest } from "../../../../../../../lib/server/routes/access-links";
import { supabaseAccessLinkInventoryGateway } from "../../../../../../../lib/server/supabase/access-link-inventory-repository";
import { supabaseAccessLinkStaffGateway } from "../../../../../../../lib/server/supabase/access-link-staff-repository";

/**
 * GET /api/v2/internal/projects/[id]/access-links (Launch Hardening 02 / P0-1)
 * — staff inventory of every INTAKE/REVIEW/PORTAL link of the Project. Never
 * returns token material.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await handleListAccessLinksRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseAccessLinkInventoryGateway,
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

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
