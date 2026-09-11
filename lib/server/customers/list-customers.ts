import type { StaffContext } from "../auth/staff-context";
import { parseLimit } from "../validation/pagination";
import type { CustomerGateway } from "./customer-gateway";
import type { CustomerRecord } from "./customer-types";

export interface ListCustomersQuery {
  limit: string | null;
  search: string | null;
}

/** List/search-Customers use case (Task 005). */
export async function listCustomers<TClient>(
  query: ListCustomersQuery,
  staff: StaffContext<TClient>,
  gateway: CustomerGateway<TClient>,
): Promise<CustomerRecord[]> {
  const limit = parseLimit(query.limit);
  const search = query.search && query.search.trim().length > 0 ? query.search.trim() : null;

  return gateway.listCustomers(staff.supabase, { limit, search });
}
