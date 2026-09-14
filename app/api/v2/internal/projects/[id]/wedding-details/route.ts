import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleGetWeddingDetailsRequest,
  handleSaveWeddingDetailsRequest,
} from "../../../../../../../lib/server/routes/wedding-details";
import { supabaseWeddingDetailsGateway } from "../../../../../../../lib/server/supabase/wedding-details-repository";

/** GET /api/v2/internal/projects/[id]/wedding-details — read canonical wedding details (Task 022). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleGetWeddingDetailsRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseWeddingDetailsGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}

/** PUT /api/v2/internal/projects/[id]/wedding-details — audited Save/upsert (Task 022). */
export async function PUT(
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

  const result = await handleSaveWeddingDetailsRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseWeddingDetailsGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
