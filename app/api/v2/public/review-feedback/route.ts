import { NextResponse } from "next/server";

import { createCustomerReviewFeedbackDependencies } from "../../../../../lib/server/customer-review/customer-review-supabase";
import { withAccessLinkTargetLimit } from "../../../../../lib/server/rate-limit/post-resolution-guards";
import { guardApiRequestByClientIp } from "../../../../../lib/server/rate-limit/rate-limit-guards";
import { createUpstashRateLimitStore } from "../../../../../lib/server/rate-limit/upstash-rate-limit-store";
import { handleSubmitReviewFeedbackRequest } from "../../../../../lib/server/routes/customer-review";

/**
 * POST /api/v2/public/review-feedback (Task 030B) — customer REVIEW
 * feedback: COMMENT, REVISION_REQUEST or APPROVAL on the exact CURRENT
 * review version. Transport auth is `Authorization: Bearer <raw REVIEW
 * token>`, never a Supabase session; project/link ids come only from the
 * resolved token. The body is read lazily, after token resolution.
 * Task 035A: CAPABILITY_MUTATION per-IP guard before resolution, then the
 * per-REVIEW-link guard after successful resolution (all feedback types).
 */
export async function POST(request: Request) {
  const store = createUpstashRateLimitStore();
  const blocked = await guardApiRequestByClientIp(request.headers, "CAPABILITY_MUTATION_IP", store);
  if (blocked !== null) {
    return blocked;
  }
  const deps = createCustomerReviewFeedbackDependencies();
  const result = await handleSubmitReviewFeedbackRequest(
    request.headers.get("authorization"),
    () => request.json(),
    { ...deps, resolution: withAccessLinkTargetLimit(deps.resolution, "REVIEW_FEEDBACK_LINK", store) },
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
