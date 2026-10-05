import { NextResponse } from "next/server";

import { createPortalGuestToolDependencies } from "../../../../../../../../lib/server/customer-portal/portal-guest-supabase";
import { handleRevokePortalGuestRequest } from "../../../../../../../../lib/server/routes/portal-guests";

/**
 * POST /api/v2/public/portal/guests/[guestId]/revoke (Task 033E-A) — soft
 * revoke (`revoked_at`); the guest's issued link stops resolving at once
 * (0042). No body, no DELETE, no restore. Bearer PORTAL token only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const { guestId } = await params;
  const result = await handleRevokePortalGuestRequest(request.headers.get("authorization"), guestId, createPortalGuestToolDependencies());
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
