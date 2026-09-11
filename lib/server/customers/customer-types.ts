/**
 * Customer domain shapes for Task 005.
 *
 * Mirrors migration 0004_customers.sql / docs/PHYSICAL_DATABASE_PLAN.md §2.2
 * exactly — no invented fields.
 */
export interface CustomerRecord {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  contactNote: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input accepted by the create-customer use case, already validated. */
export interface CreateCustomerInput {
  displayName: string;
  phone: string | null;
  email: string | null;
  contactNote: string | null;
}

export interface ListCustomersParams {
  limit: number;
  /** Optional case-insensitive substring match on display_name. */
  search: string | null;
}
