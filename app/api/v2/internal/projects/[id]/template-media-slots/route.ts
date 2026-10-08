import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import { handleListTemplateMediaSlotsRequest, handleSetTemplateMediaSlotRequest } from "../../../../../../../lib/server/routes/template-editor";
import { supabaseTemplateMediaSlotGateway } from "../../../../../../../lib/server/supabase/template-media-slot-repository";
import { supabaseSetTemplateMediaSlotDependencies } from "../../../../../../../lib/server/template-media/template-media-slot-supabase";

/**
 * GET /api/v2/internal/projects/[id]/template-media-slots?templateVersionId=<uuid>
 * — draft slot assignments of one exact template version (TE-05A).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleListTemplateMediaSlotsRequest(
    request.headers.get("authorization"),
    id,
    new URL(request.url).searchParams.get("templateVersionId"),
    supabaseStaffAuthGateway,
    supabaseTemplateMediaSlotGateway,
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

/**
 * PUT /api/v2/internal/projects/[id]/template-media-slots — replace one
 * slot (`[]` clears it). Body exactly `{ templateVersionId, slotKey,
 * projectMediaIds }`; read only after Staff auth. The slot contract comes
 * from the DB-pinned renderer's editor manifest, never from the client.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await handleSetTemplateMediaSlotRequest(
    request.headers.get("authorization"),
    id,
    () => request.json(),
    supabaseStaffAuthGateway,
    supabaseSetTemplateMediaSlotDependencies,
  );
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
