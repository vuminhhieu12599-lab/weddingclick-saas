import type { SupabaseClient } from "@supabase/supabase-js";

import type { CustomerGateway } from "../customers/customer-gateway";
import type {
  CreateCustomerInput,
  CustomerRecord,
  ListCustomersParams,
} from "../customers/customer-types";

/**
 * Production CustomerGateway (Task 005): the only place in the Customer
 * feature that issues real @supabase/supabase-js calls. Always invoked with
 * a staff-scoped client (Task 004's createStaffSupabaseClient), so
 * `customers` RLS (`is_staff()`) is what actually authorizes every request
 * here — this module never uses service_role.
 */
interface CustomerRow {
  id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
  contact_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const CUSTOMER_COLUMNS =
  "id, display_name, phone, email, contact_note, created_by, created_at, updated_at";

function toCustomerRecord(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    phone: row.phone,
    email: row.email,
    contactNote: row.contact_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseCustomerGateway: CustomerGateway<SupabaseClient> = {
  async createCustomer(client, input: CreateCustomerInput & { createdBy: string }) {
    const { data, error } = await client
      .from("customers")
      .insert({
        display_name: input.displayName,
        phone: input.phone,
        email: input.email,
        contact_note: input.contactNote,
        created_by: input.createdBy,
      })
      .select(CUSTOMER_COLUMNS)
      .single();

    if (error || !data) {
      throw new Error("Failed to create customer");
    }

    return toCustomerRecord(data as CustomerRow);
  },

  async getCustomerById(client, id: string) {
    const { data, error } = await client
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query customer");
    }

    return data ? toCustomerRecord(data as CustomerRow) : null;
  },

  async listCustomers(client, params: ListCustomersParams) {
    let query = client
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(params.limit);

    if (params.search) {
      // Case-insensitive substring match, backed by the
      // customers_display_name_lower_idx index (migration 0004).
      query = query.ilike("display_name", `%${params.search}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error("Failed to list customers");
    }

    return (data ?? []).map((row) => toCustomerRecord(row as CustomerRow));
  },
};
