import type {
  CreateCustomerInput,
  CustomerRecord,
  ListCustomersParams,
} from "./customer-types";

/**
 * Small seam (Task 005, mirrors Task 004's StaffAuthGateway pattern) that
 * decouples the Customer use cases from the real @supabase/supabase-js
 * client shape, so business rules stay unit-testable without a real
 * Supabase connection (docs/TESTING.md, CLAUDE.md "TESTABILITY").
 *
 * Every method must be called with a client already scoped to the calling
 * staff member's own JWT (Task 004's createStaffSupabaseClient) so that
 * `customers` RLS (`is_staff()`) remains the real enforcement — never
 * service_role for this table (docs/PHYSICAL_DATABASE_PLAN.md §2.2, §R5).
 */
export interface CustomerGateway<TClient> {
  createCustomer(
    client: TClient,
    input: CreateCustomerInput & { createdBy: string },
  ): Promise<CustomerRecord>;
  getCustomerById(client: TClient, id: string): Promise<CustomerRecord | null>;
  listCustomers(
    client: TClient,
    params: ListCustomersParams,
  ): Promise<CustomerRecord[]>;
}
