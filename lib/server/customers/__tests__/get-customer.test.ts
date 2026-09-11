import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { CustomerGateway } from "../customer-gateway";
import type { CustomerRecord } from "../customer-types";
import { getCustomerById } from "../get-customer";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "staff-1",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

const existingCustomer: CustomerRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  displayName: "Nguyễn Văn A",
  phone: null,
  email: null,
  contactNote: null,
  createdBy: "staff-1",
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
};

function createFakeGateway(customer: CustomerRecord | null): CustomerGateway<FakeClient> {
  return {
    async createCustomer() {
      throw new Error("not used");
    },
    async getCustomerById(_client, id) {
      return customer && customer.id === id ? customer : null;
    },
    async listCustomers() {
      return [];
    },
  };
}

describe("getCustomerById", () => {
  it("returns the customer when found", async () => {
    const gateway = createFakeGateway(existingCustomer);

    const result = await getCustomerById(existingCustomer.id, staff, gateway);

    expect(result).toEqual(existingCustomer);
  });

  it("maps a missing customer to ApiError NOT_FOUND", async () => {
    const gateway = createFakeGateway(null);

    const error = await getCustomerById(existingCustomer.id, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("rejects a malformed id as BAD_REQUEST without querying the gateway", async () => {
    let called = false;
    const gateway: CustomerGateway<FakeClient> = {
      async createCustomer() {
        throw new Error("not used");
      },
      async getCustomerById() {
        called = true;
        return null;
      },
      async listCustomers() {
        return [];
      },
    };

    const error = await getCustomerById("not-a-uuid", staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });
});
