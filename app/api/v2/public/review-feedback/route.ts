import { NextResponse } from "next/server";

import { createCustomerReviewFeedbackDependencies } from "../../../../../lib/server/customer-review/customer-review-supabase";
import { handleSubmitReviewFeedbackRequest } from "../../../../../lib/server/routes/customer-review";

/**
 * POST /api/v2/public/review-feedback (Task 030B) — customer REVIEW
 * feedback: COMMENT, REVISION_REQUEST or APPROVAL on the exact CURRENT
 * review version. Transport auth is `Authorization: Bearer <raw REVIEW
 * token>`, never a Supabase session; project/link ids come only from the
 * resolved token. The body is read lazily, after token resolution.
 */
export async function POST(request: Request) {
  const result = await handleSubmitReviewFeedbackRequest(
    request.headers.get("authorization"),
    () => request.json(),
    createCustomerReviewFeedbackDependencies(),
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
