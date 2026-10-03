import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleDeleteDressCodeSwatchRequest,
  handleUpdateDressCodeSwatchRequest,
} from "../../../../../../../../../lib/server/routes/project-dress-code";
import { supabaseProjectDressCodeWriteGateway } from "../../../../../../../../../lib/server/supabase/project-dress-code-repository";

/** PATCH /api/v2/internal/projects/[id]/dress-code/swatches/[swatchId] — colour/sortOrder. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; swatchId: string }> }) {
  const { id, swatchId } = await params;
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const result = await handleUpdateDressCodeSwatchRequest(
    request.headers.get("authorization"),
    id,
    swatchId,
    rawBody,
    supabaseStaffAuthGateway,
    supabaseProjectDressCodeWriteGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}

/** DELETE /api/v2/internal/projects/[id]/dress-code/swatches/[swatchId] */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; swatchId: string }> }) {
  const { id, swatchId } = await params;
  const result = await handleDeleteDressCodeSwatchRequest(
    request.headers.get("authorization"),
    id,
    swatchId,
    supabaseStaffAuthGateway,
    supabaseProjectDressCodeWriteGateway,
  );
  return NextResponse.json(result.body, { status: result.status });
}
