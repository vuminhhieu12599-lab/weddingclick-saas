import { NextResponse } from "next/server";

import { createPortalGuestToolDependencies } from "../../../../../../../../lib/server/customer-portal/portal-guest-supabase";
import { handleIssuePortalGuestLinkRequest } from "../../../../../../../../lib/server/routes/portal-guests";

/**
 * POST /api/v2/public/portal/guests/[guestId]/access-link (Task 033E-B) —
 * Portal ISSUE / REGENERATE of one guest's personalized link. Body
 * `{ "action": "ISSUE" | "REGENERATE" }`; Bearer PORTAL token only, no
 * Project id. The response carries the `/i/[slug]/g/[token]` path once.
 */
export async function POST(request: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const { guestId } = await params;
  const result = await handleIssuePortalGuestLinkRequest(
    request.headers.get("authorization"),
    guestId,
    () => request.json(),
    createPortalGuestToolDependencies(),
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
