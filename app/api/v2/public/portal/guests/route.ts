import { NextResponse } from "next/server";

import { createPortalGuestToolDependencies } from "../../../../../../lib/server/customer-portal/portal-guest-supabase";
import { handleCreatePortalGuestRequest } from "../../../../../../lib/server/routes/portal-guests";

/**
 * POST /api/v2/public/portal/guests (Task 033E-A) — add one guest to the
 * Project of the PORTAL link. Transport auth is `Authorization: Bearer <raw
 * PORTAL token>`; no Project id is accepted. Body `{ displayName[,
 * invitationVariant] }`, read only after authorization. No link is issued.
 */
export async function POST(request: Request) {
  const result = await handleCreatePortalGuestRequest(
    request.headers.get("authorization"),
    () => request.json(),
    createPortalGuestToolDependencies(),
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
