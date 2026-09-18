import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleMarkProjectPaidRequest } from "../../../../../../../lib/server/routes/project-lifecycle";
import { supabaseProjectLifecycleGateway } from "../../../../../../../lib/server/supabase/project-lifecycle-repository";

/** PATCH /api/v2/internal/projects/[id]/payment (Task 025 Phase 2) — mark project paid. */
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

  const result = await handleMarkProjectPaidRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectLifecycleGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
