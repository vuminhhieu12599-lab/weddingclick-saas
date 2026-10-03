import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  supabaseProjectPublishStateDependencies,
  supabasePublishInvitationDependencies,
} from "../../../../../../../lib/server/invitation-publish/invitation-publish-supabase";
import {
  handleGetProjectPublishStateRequest,
  handlePublishInvitationRequest,
} from "../../../../../../../lib/server/routes/invitation-publish";

/**
 * GET /api/v2/internal/projects/[id]/publish — staff-only Task 031 read
 * model: per required variant, approved current review, current
 * publication and publish blocker.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleGetProjectPublishStateRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseProjectPublishStateDependencies,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

/**
 * POST /api/v2/internal/projects/[id]/publish — staff-only Task 031
 * publish of one required variant's approved current REVIEW. Body:
 * `{ variant, expectedCurrentReviewVersionId, expectedPublishedVersionId }`
 * only; the publication is copied from the approved REVIEW in the database.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handlePublishInvitationRequest(
    request.headers.get("authorization"),
    id,
    () => request.json(),
    supabaseStaffAuthGateway,
    supabasePublishInvitationDependencies,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
