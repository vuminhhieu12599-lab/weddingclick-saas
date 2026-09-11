import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { CustomerGateway } from "./customer-gateway";
import type { CustomerRecord } from "./customer-types";

/** Get-Customer-by-ID use case (Task 005). */
export async function getCustomerById<TClient>(
  rawId: string,
  staff: StaffContext<TClient>,
  gateway: CustomerGateway<TClient>,
): Promise<CustomerRecord> {
  if (!isValidUuid(rawId)) {
    throw new ApiError("BAD_REQUEST", "Customer id must be a valid UUID");
  }

  const customer = await gateway.getCustomerById(staff.supabase, rawId);

  if (!customer) {
    throw new ApiError("NOT_FOUND", "Customer not found");
  }

  return customer;
}
