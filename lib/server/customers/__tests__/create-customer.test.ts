import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { createCustomer } from "../create-customer";
import type { CustomerGateway } from "../customer-gateway";
import type { CreateCustomerInput, CustomerRecord } from "../customer-types";

interface FakeClient {
  marker: string;
}

function createStaffContext(userId: string): StaffContext<FakeClient> {
  return {
    userId,
    role: "STAFF",
    displayName: "Test Staff",
    supabase: { marker: "fake-client" },
  };
}

function createFakeGateway(): {
  gateway: CustomerGateway<FakeClient>;
  received: Array<CreateCustomerInput & { createdBy: string }>;
} {
  const received: Array<CreateCustomerInput & { createdBy: string }> = [];

  const gateway: CustomerGateway<FakeClient> = {
    async createCustomer(_client, input) {
      received.push(input);
      const record: CustomerRecord = {
        id: "customer-1",
        displayName: input.displayName,
        phone: input.phone,
        email: input.email,
        contactNote: input.contactNote,
        createdBy: input.createdBy,
        createdAt: "2026-09-11T00:00:00.000Z",
        updatedAt: "2026-09-11T00:00:00.000Z",
      };
      return record;
    },
    async getCustomerById() {
      return null;
    },
    async listCustomers() {
      return [];
    },
  };

  return { gateway, received };
}

describe("createCustomer", () => {
  it("uses StaffContext.userId as created_by", async () => {
    const { gateway, received } = createFakeGateway();
    const staff = createStaffContext("staff-user-1");

    const record = await createCustomer({ displayName: "Nguyễn Văn A" }, staff, gateway);

    expect(received).toHaveLength(1);
    expect(received[0].createdBy).toBe("staff-user-1");
    expect(record.createdBy).toBe("staff-user-1");
  });

  it("cannot be overridden by a caller-supplied created_by/createdBy in the body", async () => {
    const { gateway, received } = createFakeGateway();
    const staff = createStaffContext("staff-user-1");

    await createCustomer(
      { displayName: "Nguyễn Văn A", createdBy: "attacker-uuid", created_by: "attacker-uuid" },
      staff,
      gateway,
    );

    expect(received[0].createdBy).toBe("staff-user-1");
  });

  it("rejects a request missing displayName before ever calling the gateway", async () => {
    const { gateway, received } = createFakeGateway();
    const staff = createStaffContext("staff-user-1");

    await expect(createCustomer({}, staff, gateway)).rejects.toBeInstanceOf(ApiError);
    expect(received).toHaveLength(0);
  });
});
