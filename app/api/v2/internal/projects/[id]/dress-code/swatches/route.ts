import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleCreateDressCodeSwatchRequest } from "../../../../../../../../lib/server/routes/project-dress-code";
import { supabaseProjectDressCodeWriteGateway } from "../../../../../../../../lib/server/supabase/project-dress-code-repository";

/** POST /api/v2/internal/projects/[id]/dress-code/swatches — add one swatch. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const result = await handleCreateDressCodeSwatchRequest(
    request.headers.get("authorization"),
    id,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectDressCodeWriteGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}
