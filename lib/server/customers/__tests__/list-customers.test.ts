import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { CustomerGateway } from "../customer-gateway";
import type { CustomerRecord, ListCustomersParams } from "../customer-types";
import { listCustomers } from "../list-customers";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "staff-1",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

function createFakeGateway(records: CustomerRecord[]): {
  gateway: CustomerGateway<FakeClient>;
  receivedParams: ListCustomersParams[];
} {
  const receivedParams: ListCustomersParams[] = [];

  const gateway: CustomerGateway<FakeClient> = {
    async createCustomer() {
      throw new Error("not used");
    },
    async getCustomerById() {
      return null;
    },
    async listCustomers(_client, params) {
      receivedParams.push(params);
      return records;
    },
  };

  return { gateway, receivedParams };
}

describe("listCustomers", () => {
  it("defaults limit and search when neither is supplied", async () => {
    const { gateway, receivedParams } = createFakeGateway([]);

    await listCustomers({ limit: null, search: null }, staff, gateway);

    expect(receivedParams[0]).toEqual({ limit: 20, search: null });
  });

  it("passes through a valid explicit limit and trimmed search", async () => {
    const { gateway, receivedParams } = createFakeGateway([]);

    await listCustomers({ limit: "5", search: "  Nguyễn  " }, staff, gateway);

    expect(receivedParams[0]).toEqual({ limit: 5, search: "Nguyễn" });
  });

  it("rejects an out-of-range limit", async () => {
    const { gateway } = createFakeGateway([]);

    await expect(
      listCustomers({ limit: "0", search: null }, staff, gateway),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      listCustomers({ limit: "101", search: null }, staff, gateway),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
