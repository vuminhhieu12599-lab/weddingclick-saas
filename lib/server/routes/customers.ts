import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { createCustomer } from "../customers/create-customer";
import type { CustomerGateway } from "../customers/customer-gateway";
import type { CustomerRecord } from "../customers/customer-types";
import { getCustomerById } from "../customers/get-customer";
import { listCustomers, type ListCustomersQuery } from "../customers/list-customers";
import { ApiError, apiErrorStatus } from "../errors/api-error";

/**
 * Pure, framework-agnostic handlers backing the Customer HTTP endpoints
 * (Task 005), kept separate from Next.js Route Handlers so they can be unit
 * tested with fake gateways and no real HTTP/Supabase dependency — mirrors
 * lib/server/routes/staff-me.ts (Task 004).
 */
export interface ApiResult<TBody> {
  status: 200 | 201 | 400 | 401 | 403 | 404 | 409 | 500;
  body: TBody | { error: string };
}

/**
 * Shared error mapping for every Task 005 route handler: StaffAuthError ->
 * 401/403/500 (Task 004 boundary, unchanged), ApiError -> 400/404/409/500,
 * anything else -> a fixed 500 body with a fixed, static log label — never
 * error.message or any other property of the caught value.
 */
function toErrorResult(error: unknown, logLabel: string): ApiResult<never> {
  if (error instanceof StaffAuthError) {
    if (error.kind === "UNAUTHENTICATED") {
      return { status: 401, body: { error: error.message } };
    }
    if (error.kind === "FORBIDDEN") {
      return { status: 403, body: { error: error.message } };
    }
    return { status: 500, body: { error: "Internal server error" } };
  }

  if (error instanceof ApiError) {
    if (error.kind === "INTERNAL") {
      return { status: 500, body: { error: "Internal server error" } };
    }
    return { status: apiErrorStatus(error.kind), body: { error: error.message } };
  }

  console.error(logLabel);
  return { status: 500, body: { error: "Internal server error" } };
}

export async function handleCreateCustomerRequest<TClient>(
  authorizationHeader: string | null,
  rawBody: unknown,
  authGateway: StaffAuthGateway<TClient>,
  customerGateway: CustomerGateway<TClient>,
): Promise<ApiResult<CustomerRecord>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const customer = await createCustomer(rawBody, staff, customerGateway);
    return { status: 201, body: customer };
  } catch (error) {
    return toErrorResult(error, "[handleCreateCustomerRequest] Unexpected error");
  }
}

export async function handleGetCustomerRequest<TClient>(
  authorizationHeader: string | null,
  customerId: string,
  authGateway: StaffAuthGateway<TClient>,
  customerGateway: CustomerGateway<TClient>,
): Promise<ApiResult<CustomerRecord>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const customer = await getCustomerById(customerId, staff, customerGateway);
    return { status: 200, body: customer };
  } catch (error) {
    return toErrorResult(error, "[handleGetCustomerRequest] Unexpected error");
  }
}

export async function handleListCustomersRequest<TClient>(
  authorizationHeader: string | null,
  query: ListCustomersQuery,
  authGateway: StaffAuthGateway<TClient>,
  customerGateway: CustomerGateway<TClient>,
): Promise<ApiResult<CustomerRecord[]>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "Missing or malformed Authorization header" } };
  }

  try {
    const staff = await requireStaff(token, authGateway);
    const customers = await listCustomers(query, staff, customerGateway);
    return { status: 200, body: customers };
  } catch (error) {
    return toErrorResult(error, "[handleListCustomersRequest] Unexpected error");
  }
}
