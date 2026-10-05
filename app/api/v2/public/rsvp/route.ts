import { NextResponse } from "next/server";

import { createPublicRsvpDependencies } from "../../../../../lib/server/public-rsvp/public-rsvp-supabase";
import { handleSubmitPublicRsvpRequest } from "../../../../../lib/server/routes/public-rsvp";

/**
 * POST /api/v2/public/rsvp (Task 033A) — one non-personalized RSVP from the
 * public published invitation /i/[slug]. No session and no token: the body's
 * `publicSlug` is resolved server-side to its CURRENT PUBLISHED invitation,
 * and Project/invitation/version are never accepted from the browser.
 * Rate limiting is the Task 035 pre-production gate.
 */
export async function POST(request: Request) {
  const result = await handleSubmitPublicRsvpRequest(() => request.json(), createPublicRsvpDependencies());
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
