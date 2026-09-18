import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleReassignProjectStaffRequest } from "../../../../../../../lib/server/routes/project-lifecycle";
import { supabaseProjectLifecycleGateway } from "../../../../../../../lib/server/supabase/project-lifecycle-repository";

/** PATCH /api/v2/internal/projects/[id]/assignment (Task 025 Phase 2) — staff assignment/reassignment/unassignment. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const result = await handleReassignProjectStaffRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectLifecycleGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
