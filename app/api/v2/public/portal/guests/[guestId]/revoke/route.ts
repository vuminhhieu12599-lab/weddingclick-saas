import { NextResponse } from "next/server";

import { createPortalGuestToolDependencies } from "../../../../../../../../lib/server/customer-portal/portal-guest-supabase";
import { withPortalGuestMutationLimit } from "../../../../../../../../lib/server/rate-limit/post-resolution-guards";
import { guardApiRequestByClientIp } from "../../../../../../../../lib/server/rate-limit/rate-limit-guards";
import { createUpstashRateLimitStore } from "../../../../../../../../lib/server/rate-limit/upstash-rate-limit-store";
import { handleRevokePortalGuestRequest } from "../../../../../../../../lib/server/routes/portal-guests";

/**
 * POST /api/v2/public/portal/guests/[guestId]/revoke (Task 033E-A) — soft
 * revoke (`revoked_at`); the guest's issued link stops resolving at once
 * (0042). No body, no DELETE, no restore. Bearer PORTAL token only.
 *
 * Task 035A: CAPABILITY_MUTATION per-IP guard before resolution, then the
 * per-PORTAL-link guard after successful resolution.
 */
export async function POST(request: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const store = createUpstashRateLimitStore();
  const blocked = await guardApiRequestByClientIp(request.headers, "CAPABILITY_MUTATION_IP", store);
  if (blocked !== null) {
    return blocked;
  }
  const { guestId } = await params;
  const result = await handleRevokePortalGuestRequest(
    request.headers.get("authorization"),
    guestId,
    withPortalGuestMutationLimit(createPortalGuestToolDependencies(), store),
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
