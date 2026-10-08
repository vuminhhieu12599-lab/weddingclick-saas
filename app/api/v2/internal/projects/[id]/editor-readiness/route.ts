import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleEditorReadinessRequest } from "../../../../../../../lib/server/routes/template-editor";
import { supabaseEditorReadinessDependencies } from "../../../../../../../lib/server/template-editor/template-editor-supabase";

/**
 * GET /api/v2/internal/projects/[id]/editor-readiness — template-aware Staff
 * readiness guidance (TE-05A). Never changes Review validation.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleEditorReadinessRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseEditorReadinessDependencies,
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
