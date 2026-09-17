import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleFinalizeMediaRequest } from "../../../../../../../../lib/server/routes/project-media";
import { supabaseProjectMediaGateway } from "../../../../../../../../lib/server/supabase/project-media-repository";

/**
 * POST /api/v2/internal/projects/[id]/media/finalize (Task 024 Phase 2).
 * Runs only after the browser reports a successful direct Storage upload.
 * Only ever parses a small JSON body — never reads/proxies a file body.
 */
export async function POST(
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

  const result = await handleFinalizeMediaRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectMediaGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
