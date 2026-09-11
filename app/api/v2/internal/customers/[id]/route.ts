import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../../lib/server/auth/staff-auth-gateway";
import { handleGetCustomerRequest } from "../../../../../../lib/server/routes/customers";
import { supabaseCustomerGateway } from "../../../../../../lib/server/supabase/customer-repository";

/** GET /api/v2/internal/customers/[id] — get one Customer by id (Task 005). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await handleGetCustomerRequest(
    request.headers.get("authorization"),
    id,
    supabaseStaffAuthGateway,
    supabaseCustomerGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
