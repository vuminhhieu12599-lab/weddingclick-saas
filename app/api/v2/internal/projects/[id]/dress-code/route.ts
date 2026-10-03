import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleGetProjectDressCodeRequest,
  handleSaveProjectDressCodeRequest,
} from "../../../../../../../lib/server/routes/project-dress-code";
import {
  supabaseProjectDressCodeGateway,
  supabaseProjectDressCodeWriteGateway,
} from "../../../../../../../lib/server/supabase/project-dress-code-repository";

/** GET /api/v2/internal/projects/[id]/dress-code — Dress Code + ordered swatches, or null. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleGetProjectDressCodeRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseProjectDressCodeWriteGateway,
    supabaseProjectDressCodeGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}

/** PUT /api/v2/internal/projects/[id]/dress-code — create the Dress Code or replace its description. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const result = await handleSaveProjectDressCodeRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectDressCodeWriteGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}
