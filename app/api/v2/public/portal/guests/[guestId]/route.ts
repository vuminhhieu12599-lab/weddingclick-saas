import { NextResponse } from "next/server";

import { createPortalGuestToolDependencies } from "../../../../../../../lib/server/customer-portal/portal-guest-supabase";
import { withPortalGuestMutationLimit } from "../../../../../../../lib/server/rate-limit/post-resolution-guards";
import { guardApiRequestByClientIp } from "../../../../../../../lib/server/rate-limit/rate-limit-guards";
import { createUpstashRateLimitStore } from "../../../../../../../lib/server/rate-limit/upstash-rate-limit-store";
import { handleUpdatePortalGuestRequest } from "../../../../../../../lib/server/routes/portal-guests";

/**
 * PATCH /api/v2/public/portal/guests/[guestId] (Task 033E-A) — edit the
 * display name and, while no personalized link is issued, the SEPARATE
 * side. Bearer PORTAL token only; the guest id merely targets a row of the
 * resolved Project.
 *
 * Task 035A: CAPABILITY_MUTATION per-IP guard before resolution, then the
 * per-PORTAL-link guard after successful resolution.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const store = createUpstashRateLimitStore();
  const blocked = await guardApiRequestByClientIp(request.headers, "CAPABILITY_MUTATION_IP", store);
  if (blocked !== null) {
    return blocked;
  }
  const { guestId } = await params;
  const result = await handleUpdatePortalGuestRequest(
    request.headers.get("authorization"),
    guestId,
    () => request.json(),
    withPortalGuestMutationLimit(createPortalGuestToolDependencies(), store),
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
