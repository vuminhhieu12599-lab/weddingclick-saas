import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import type { ProjectGateway } from "../../projects/project-gateway";
import type { ProjectSummary } from "../../projects/project-types";
import { handleGetProjectRequest, handleListProjectsRequest } from "../projects";

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

function createFakeProjectGateway(): ProjectGateway<FakeClient> {
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
