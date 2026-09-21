import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleGetProjectDesignRequest,
  handleSaveProjectDesignRequest,
} from "../../../../../../../lib/server/routes/project-design";
import { supabaseProjectDesignGateway } from "../../../../../../../lib/server/supabase/project-design-repository";

/** GET /api/v2/internal/projects/[id]/design — read the current project design (Task 028). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleGetProjectDesignRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseProjectDesignGateway,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

/**
 * PUT /api/v2/internal/projects/[id]/design — validated upsert (Task 028).
 *
 * The request body is deliberately NOT read here (Task 028 closure §2/§10,
 * mirrors Task 027 Phase 2 Finding A) — `request.json` is passed as a lazy,
 * uninvoked callback so the handler reads it only after `requireStaff` has
 * already succeeded. Reading it eagerly here would let a malformed-JSON
 * body preempt the frozen transport/staff-authorization/body error
 * precedence.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleSaveProjectDesignRequest(
    request.headers.get("authorization"),
    id,
    () => request.json(),
    supabaseStaffAuthGateway,
    supabaseProjectDesignGateway,
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
