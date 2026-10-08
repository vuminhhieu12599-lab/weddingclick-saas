import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleListPhotoLibraryRequest } from "../../../../../../../lib/server/routes/template-editor";
import { supabasePhotoLibraryDependencies } from "../../../../../../../lib/server/template-editor/template-editor-supabase";

/**
 * GET /api/v2/internal/projects/[id]/photo-library — the Project's
 * slot-assignable photographs with short-lived staff-signed preview URLs
 * (TE-05A). No storage path or bucket is returned.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleListPhotoLibraryRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabasePhotoLibraryDependencies,
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
