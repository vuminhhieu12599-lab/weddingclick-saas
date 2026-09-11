import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import type { CustomerGateway } from "../../customers/customer-gateway";
import type { CustomerRecord } from "../../customers/customer-types";
import {
  handleCreateCustomerRequest,
  handleGetCustomerRequest,
  handleListCustomersRequest,
} from "../customers";

interface FakeClient {
  marker: string;
}

function createFakeAuthGateway(options: {
  userId?: string | null;
  profile?: { role: string; displayName: string } | null;
}): StaffAuthGateway<FakeClient> {
  return {
    createClient: (accessToken) => ({ marker: `client-for-${accessToken}` }),
    async getAuthenticatedUserId() {
      return options.userId ?? null;
    },
    async getActiveStaffProfile() {
      return options.profile ?? null;
    },
  };
}

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

function createFakeCustomerGateway(): CustomerGateway<FakeClient> {
  return {
    async createCustomer(_client, input) {
      return { ...existingCustomer, ...input };
    },
    async getCustomerById(_client, id) {
      return id === existingCustomer.id ? existingCustomer : null;
    },
    async listCustomers() {
      return [existingCustomer];
    },
  };
}

const activeStaffAuth = createFakeAuthGateway({
  userId: "staff-1",
  profile: { role: "STAFF", displayName: "Test Staff" },
});

describe("handleCreateCustomerRequest", () => {
  it("returns 201 for a valid authenticated request", async () => {
    const result = await handleCreateCustomerRequest(
      "Bearer good-token",
      { displayName: "Nguyễn Văn A" },
      activeStaffAuth,
      createFakeCustomerGateway(),
    );

    expect(result.status).toBe(201);
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleCreateCustomerRequest(
      null,
      { displayName: "A" },
      activeStaffAuth,
      createFakeCustomerGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleCreateCustomerRequest(
      "Bearer token",
      { displayName: "A" },
      noProfileAuth,
      createFakeCustomerGateway(),
    );

    expect(result.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    const result = await handleCreateCustomerRequest(
      "Bearer good-token",
      {},
      activeStaffAuth,
      createFakeCustomerGateway(),
    );

    expect(result.status).toBe(400);
  });
});

describe("handleGetCustomerRequest", () => {
  it("returns 200 for an existing customer", async () => {
    const result = await handleGetCustomerRequest(
      "Bearer good-token",
      existingCustomer.id,
      activeStaffAuth,
      createFakeCustomerGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual(existingCustomer);
  });

  it("returns 404 for a well-formed but unknown id", async () => {
    const result = await handleGetCustomerRequest(
      "Bearer good-token",
      "22222222-2222-2222-2222-222222222222",
      activeStaffAuth,
      createFakeCustomerGateway(),
    );

    expect(result.status).toBe(404);
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleGetCustomerRequest(
      null,
      existingCustomer.id,
      activeStaffAuth,
      createFakeCustomerGateway(),
    );

    expect(result.status).toBe(401);
  });
});

describe("handleListCustomersRequest", () => {
  it("returns 200 with a list", async () => {
    const result = await handleListCustomersRequest(
      "Bearer good-token",
      { limit: null, search: null },
      activeStaffAuth,
      createFakeCustomerGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual([existingCustomer]);
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleListCustomersRequest(
      null,
      { limit: null, search: null },
      activeStaffAuth,
      createFakeCustomerGateway(),
    );

    expect(result.status).toBe(401);
  });
});
