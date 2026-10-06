import { NextResponse } from "next/server";

import { createPublicRsvpDependencies } from "../../../../../lib/server/public-rsvp/public-rsvp-supabase";
import { withPersonalizedRsvpGuestLimit } from "../../../../../lib/server/rate-limit/post-resolution-guards";
import { guardApiRequestByClientIp } from "../../../../../lib/server/rate-limit/rate-limit-guards";
import { createUpstashRateLimitStore } from "../../../../../lib/server/rate-limit/upstash-rate-limit-store";
import { handleSubmitPublicRsvpRequest } from "../../../../../lib/server/routes/public-rsvp";
import { getServiceRolePublicGuestIdentityGateway } from "../../../../../lib/server/supabase/public-guest-identity-repository";

/**
 * POST /api/v2/public/rsvp (Task 033A) — one non-personalized RSVP from the
 * public published invitation /i/[slug]. No session and no token: the body's
 * `publicSlug` is resolved server-side to its CURRENT PUBLISHED invitation,
 * and Project/invitation/version are never accepted from the browser.
 * Task 033B1: an optional `guestToken` (personalized /i/[slug]/g/[token])
 * binds the response to that guest's one current RSVP; the guest id is never
 * accepted from the browser.
 *
 * Task 035A: PUBLIC_WRITE per-IP guard before anything else (generic and
 * personalized alike); personalized submissions also get the per-guest guard
 * once the token resolves to an active guest. Limiter store unavailable →
 * 503, nothing written.
 */
export async function POST(request: Request) {
  const store = createUpstashRateLimitStore();
  const blocked = await guardApiRequestByClientIp(request.headers, "PUBLIC_WRITE_IP", store);
  if (blocked !== null) {
    return blocked;
  }
  const deps = createPublicRsvpDependencies();
  const guarded = {
    ...deps,
    guestRsvps:
      deps.guestRsvps === undefined
        ? undefined
        : withPersonalizedRsvpGuestLimit(deps.guestRsvps, getServiceRolePublicGuestIdentityGateway(), store),
  };
  const result = await handleSubmitPublicRsvpRequest(() => request.json(), guarded);
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
