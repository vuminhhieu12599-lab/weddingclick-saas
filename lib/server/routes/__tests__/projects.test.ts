import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectGateway } from "../../projects/project-gateway";
import type { CreateProjectRpcParams, ProjectSummary } from "../../projects/project-types";
import {
  handleCreateProjectRequest,
  handleGetProjectRequest,
  handleListProjectsRequest,
} from "../projects";

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

const existingProject: ProjectSummary = {
  id: "11111111-1111-1111-1111-111111111111",
  projectCode: "WC-2026-000001",
  customer: { id: "cust-1", displayName: "Nguyễn Văn A" },
  eventType: "WEDDING",
  status: "NEW",
  deadlineAt: null,
  assignedStaff: null,
  packageCodeSnapshot: "COMMON",
  packageNameSnapshot: "Common Invitation",
  basePriceVnd: 150000,
  addonTotalVnd: 0,
  totalPriceVnd: 150000,
  paymentStatus: "UNPAID",
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
  addons: [],
};

function createFakeProjectGateway(options?: {
  createProject?: ProjectGateway<FakeClient>["createProject"];
}): ProjectGateway<FakeClient> {
  return {
    async getProjectById(_client, id) {
      return id === existingProject.id ? existingProject : null;
    },
    async listProjects() {
      return [existingProject];
    },
    async getPackageByCode() {
      return null;
    },
    async getAddonsByCodes() {
      return [];
    },
    async getActiveStaffProfileById() {
      return null;
    },
    async createProject(client, params) {
      if (options?.createProject) {
        return options.createProject(client, params);
      }
      return { id: "33333333-3333-3333-3333-333333333333" };
    },
  };
}

const activeStaffAuth = createFakeAuthGateway({
  userId: "staff-1",
  profile: { role: "STAFF", displayName: "Test Staff" },
});

describe("handleGetProjectRequest", () => {
  it("returns 200 for an existing project", async () => {
    const result = await handleGetProjectRequest(
      "Bearer good-token",
      existingProject.id,
      activeStaffAuth,
      createFakeProjectGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual(existingProject);
  });

  it("returns 404 for a well-formed but unknown id", async () => {
    const result = await handleGetProjectRequest(
      "Bearer good-token",
      "22222222-2222-2222-2222-222222222222",
      activeStaffAuth,
      createFakeProjectGateway(),
    );

    expect(result.status).toBe(404);
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleGetProjectRequest(
      null,
      existingProject.id,
      activeStaffAuth,
      createFakeProjectGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleGetProjectRequest(
      "Bearer token",
      existingProject.id,
      noProfileAuth,
      createFakeProjectGateway(),
    );

    expect(result.status).toBe(403);
  });
});

describe("handleListProjectsRequest", () => {
  it("returns 200 with a list", async () => {
    const result = await handleListProjectsRequest(
      "Bearer good-token",
      { limit: null, status: null, customerId: null, projectCode: null },
      activeStaffAuth,
      createFakeProjectGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual([existingProject]);
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleListProjectsRequest(
      null,
      { limit: null, status: null, customerId: null, projectCode: null },
      activeStaffAuth,
      createFakeProjectGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 400 for an invalid filter", async () => {
    const result = await handleListProjectsRequest(
      "Bearer good-token",
      { limit: null, status: "NOT_A_STATUS", customerId: null, projectCode: null },
      activeStaffAuth,
      createFakeProjectGateway(),
    );

    expect(result.status).toBe(400);
  });
});

const validCreateBody = {
  customerId: "11111111-1111-1111-1111-111111111111",
  packageCode: "COMMON",
  addonCodes: ["PERSONALIZED_GUEST"],
  assignedStaffId: null,
  deadlineAt: null,
};

describe("handleCreateProjectRequest", () => {
  it("returns 401 without an Authorization header", async () => {
    const result = await handleCreateProjectRequest(
      null,
      validCreateBody,
      activeStaffAuth,
      createFakeProjectGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleCreateProjectRequest(
      "Bearer token",
      validCreateBody,
      noProfileAuth,
      createFakeProjectGateway(),
    );

    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed request body", async () => {
    const result = await handleCreateProjectRequest(
      "Bearer good-token",
      { customerId: "not-a-uuid", packageCode: "COMMON" },
      activeStaffAuth,
      createFakeProjectGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("rejects a forbidden server-derived field (basePriceVnd) with 400 without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeProjectGateway({
      createProject: async () => {
        called = true;
        return { id: "should-not-be-reached" };
      },
    });

    const result = await handleCreateProjectRequest(
      "Bearer good-token",
      { ...validCreateBody, basePriceVnd: 999 },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });

  it("rejects a forbidden createdBy field with 400 without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeProjectGateway({
      createProject: async () => {
        called = true;
        return { id: "should-not-be-reached" };
      },
    });

    const result = await handleCreateProjectRequest(
      "Bearer good-token",
      { ...validCreateBody, createdBy: "11111111-1111-1111-1111-111111111111" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });

  it("calls the gateway with business intent only — no createdBy, no price/id/snapshot fields", async () => {
    let receivedParams: CreateProjectRpcParams | undefined;
    const gateway = createFakeProjectGateway({
      createProject: async (_client, params) => {
        receivedParams = params;
        return { id: "44444444-4444-4444-4444-444444444444" };
      },
    });

    const result = await handleCreateProjectRequest(
      "Bearer good-token",
      validCreateBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(201);
    expect(result.body).toEqual({ id: "44444444-4444-4444-4444-444444444444" });
    expect(receivedParams).toEqual({
      customerId: validCreateBody.customerId,
      packageCode: validCreateBody.packageCode,
      addonCodes: validCreateBody.addonCodes,
      assignedStaffId: null,
      deadlineAt: null,
    });
    expect(receivedParams).not.toHaveProperty("createdBy");
    expect(receivedParams).not.toHaveProperty("basePriceVnd");
    expect(receivedParams).not.toHaveProperty("servicePackageId");
  });

  it("maps a known RPC business error (via the gateway) to its HTTP status", async () => {
    const gateway = createFakeProjectGateway({
      createProject: async () => {
        throw new ApiError("NOT_FOUND", "Customer not found");
      },
    });

    const result = await handleCreateProjectRequest(
      "Bearer good-token",
      validCreateBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Customer not found" });
  });

  it("maps an unexpected gateway failure to a generic 500 without leaking details", async () => {
    const gateway = createFakeProjectGateway({
      createProject: async () => {
        throw new Error("relation \"public.projects\" violates some internal constraint detail");
      },
    });

    const result = await handleCreateProjectRequest(
      "Bearer good-token",
      validCreateBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });
});
