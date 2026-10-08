import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../lib/server/auth/staff-auth-gateway";
import { handleListTemplatesRequest } from "../../../../../lib/server/routes/templates";
import { supabaseTemplatesGateway } from "../../../../../lib/server/supabase/templates-repository";
import { lookupTemplateEditorManifest } from "../../../../../templates/core/production-editor-manifests";

/**
 * GET /api/v2/internal/templates — complete template/version catalog,
 * including inactive templates and retired versions (Task 028); each
 * version carries its registry-owned `editorManifest` (TE-05A).
 */
export async function GET(request: Request) {
  const result = await handleListTemplatesRequest(
    request.headers.get("authorization"),
    supabaseStaffAuthGateway,
    supabaseTemplatesGateway,
    lookupTemplateEditorManifest,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
