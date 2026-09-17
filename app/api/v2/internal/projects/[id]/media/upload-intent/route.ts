import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleCreateMediaUploadIntentRequest } from "../../../../../../../../lib/server/routes/project-media";
import { supabaseProjectMediaGateway } from "../../../../../../../../lib/server/supabase/project-media-repository";

/**
 * POST /api/v2/internal/projects/[id]/media/upload-intent (Task 024
 * Phase 2). Only ever parses a small JSON body — never reads/proxies a
 * file body; the browser uploads file bytes directly to Supabase Storage
 * using the returned token (Task 024 Phase 2 §0).
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

  const result = await handleCreateMediaUploadIntentRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectMediaGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
