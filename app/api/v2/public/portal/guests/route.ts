import { NextResponse } from "next/server";

import { createPortalGuestToolDependencies } from "../../../../../../lib/server/customer-portal/portal-guest-supabase";
import { withPortalGuestMutationLimit } from "../../../../../../lib/server/rate-limit/post-resolution-guards";
import { guardApiRequestByClientIp } from "../../../../../../lib/server/rate-limit/rate-limit-guards";
import { createUpstashRateLimitStore } from "../../../../../../lib/server/rate-limit/upstash-rate-limit-store";
import { handleCreatePortalGuestRequest } from "../../../../../../lib/server/routes/portal-guests";

/**
 * POST /api/v2/public/portal/guests (Task 033E-A) — add one guest to the
 * Project of the PORTAL link. Transport auth is `Authorization: Bearer <raw
 * PORTAL token>`; no Project id is accepted. Body `{ displayName[,
 * invitationVariant] }`, read only after authorization. No link is issued.
 *
 * Task 035A: CAPABILITY_MUTATION per-IP guard before resolution, then the
 * per-PORTAL-link guard after successful resolution.
 */
export async function POST(request: Request) {
  const store = createUpstashRateLimitStore();
  const blocked = await guardApiRequestByClientIp(request.headers, "CAPABILITY_MUTATION_IP", store);
  if (blocked !== null) {
    return blocked;
  }
  const result = await handleCreatePortalGuestRequest(
    request.headers.get("authorization"),
    () => request.json(),
    withPortalGuestMutationLimit(createPortalGuestToolDependencies(), store),
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
