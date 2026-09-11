import type { StaffContext } from "../auth/staff-context";
import type { CustomerGateway } from "./customer-gateway";
import type { CustomerRecord } from "./customer-types";
import { validateCreateCustomerInput } from "./validate-customer-input";

/**
 * Create-Customer use case (Task 005).
 *
 * `created_by` always comes from the verified StaffContext.userId — never
 * from the request body, regardless of what the caller sends
 * (CLAUDE.md "Client must never be allowed to specify created_by").
 */
export async function createCustomer<TClient>(
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: CustomerGateway<TClient>,
): Promise<CustomerRecord> {
  const input = validateCreateCustomerInput(rawBody);

  return gateway.createCustomer(staff.supabase, {
    ...input,
    createdBy: staff.userId,
  });
}
