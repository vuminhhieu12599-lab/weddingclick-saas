import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../lib/server/auth/staff-auth-gateway";
import { handleStaffMeRequest } from "../../../../../lib/server/routes/staff-me";

/**
 * GET /api/v2/internal/me — Task 004 worked example proving the trusted
 * staff server boundary end to end:
 *
 *   Authorization: Bearer <supabase_access_token>
 *     -> parseBearerToken (reject malformed/missing)
 *     -> requireStaff (validate token via Supabase Auth, authorize via
 *        profiles RLS under the caller's own JWT)
 *     -> safe identity fields only
 *
 * No business mutation. No UI page. Never returns the access token,
 * refresh token, or any Supabase session/internal error detail.
 */
export async function GET(request: Request) {
  const result = await handleStaffMeRequest(
    request.headers.get("authorization"),
    supabaseStaffAuthGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
