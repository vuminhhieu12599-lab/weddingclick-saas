import { NextResponse } from "next/server";

import { createPortalGuestToolDependencies } from "../../../../../../../lib/server/customer-portal/portal-guest-supabase";
import { handleUpdatePortalGuestRequest } from "../../../../../../../lib/server/routes/portal-guests";

/**
 * PATCH /api/v2/public/portal/guests/[guestId] (Task 033E-A) — edit the
 * display name and, while no personalized link is issued, the SEPARATE
 * side. Bearer PORTAL token only; the guest id merely targets a row of the
 * resolved Project.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const { guestId } = await params;
  const result = await handleUpdatePortalGuestRequest(
    request.headers.get("authorization"),
    guestId,
    () => request.json(),
    createPortalGuestToolDependencies(),
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
