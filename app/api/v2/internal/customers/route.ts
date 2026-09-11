import { NextResponse } from "next/server";

import { supabaseStaffAuthGateway } from "../../../../../lib/server/auth/staff-auth-gateway";
import {
  handleCreateCustomerRequest,
  handleListCustomersRequest,
} from "../../../../../lib/server/routes/customers";
import { supabaseCustomerGateway } from "../../../../../lib/server/supabase/customer-repository";

/**
 * GET  /api/v2/internal/customers — list/search Customers (Task 005).
 * POST /api/v2/internal/customers — create a Customer (Task 005).
 *
 * Both require Authorization: Bearer <staff access token>, resolved through
 * the Task 004 trusted staff boundary. All database access goes through the
 * staff-scoped Supabase client, never service_role (docs/SECURITY.md §5.3).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  const result = await handleListCustomersRequest(
    request.headers.get("authorization"),
    {
      limit: url.searchParams.get("limit"),
      search: url.searchParams.get("search"),
    },
    supabaseStaffAuthGateway,
    supabaseCustomerGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const result = await handleCreateCustomerRequest(
    request.headers.get("authorization"),
    rawBody,
    supabaseStaffAuthGateway,
    supabaseCustomerGateway,
  );

  return NextResponse.json(result.body, { status: result.status });
}
