import { NextResponse } from "next/server";

import { createPortalGuestToolDependencies } from "../../../../../../../../lib/server/customer-portal/portal-guest-supabase";
import { withPortalGuestLinkMintLimit } from "../../../../../../../../lib/server/rate-limit/post-resolution-guards";
import { guardApiRequestByClientIp } from "../../../../../../../../lib/server/rate-limit/rate-limit-guards";
import { createUpstashRateLimitStore } from "../../../../../../../../lib/server/rate-limit/upstash-rate-limit-store";
import { handleIssuePortalGuestLinkRequest } from "../../../../../../../../lib/server/routes/portal-guests";

/**
 * POST /api/v2/public/portal/guests/[guestId]/access-link (Task 033E-B) —
 * Portal ISSUE / REGENERATE of one guest's personalized link. Body
 * `{ "action": "ISSUE" | "REGENERATE" }`; Bearer PORTAL token only, no
 * Project id. The response carries the `/i/[slug]/g/[token]` path once.
 *
 * Task 035A: CAPABILITY_MUTATION per-IP guard before resolution, then the
 * per-guest ISSUE/REGENERATE (5/hour) guard after successful resolution.
 */
export async function POST(request: Request, { params }: { params: Promise<{ guestId: string }> }) {
  const store = createUpstashRateLimitStore();
  const blocked = await guardApiRequestByClientIp(request.headers, "CAPABILITY_MUTATION_IP", store);
  if (blocked !== null) {
    return blocked;
  }
  const { guestId } = await params;
  const result = await handleIssuePortalGuestLinkRequest(
    request.headers.get("authorization"),
    guestId,
    () => request.json(),
    withPortalGuestLinkMintLimit(createPortalGuestToolDependencies(), store),
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
