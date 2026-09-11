import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { listProjects } from "../list-projects";
import type { ProjectGateway } from "../project-gateway";
import type { ListProjectsParams } from "../project-types";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "staff-1",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

function createFakeGateway(): {
  gateway: ProjectGateway<FakeClient>;
  receivedParams: ListProjectsParams[];
} {
  const receivedParams: ListProjectsParams[] = [];

  const gateway: ProjectGateway<FakeClient> = {
    async getProjectById() {
      return null;
    },
    async listProjects(_client, params) {
      receivedParams.push(params);
      return [];
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
    async createProject() {
      throw new Error("createProject should not be called in this test");
    },
  };

  return { gateway, receivedParams };
}

describe("listProjects", () => {
  it("defaults limit and every filter when none are supplied", async () => {
    const { gateway, receivedParams } = createFakeGateway();

    await listProjects({ limit: null, status: null, customerId: null, projectCode: null }, staff, gateway);

    expect(receivedParams[0]).toEqual({
      limit: 20,
      status: null,
      customerId: null,
      projectCode: null,
    });
  });

  it("passes through valid explicit filters", async () => {
    const { gateway, receivedParams } = createFakeGateway();

    await listProjects(
      {
        limit: "10",
        status: "IN_PROGRESS",
        customerId: "11111111-1111-1111-1111-111111111111",
        projectCode: "WC-2026-000001",
      },
      staff,
      gateway,
    );

    expect(receivedParams[0]).toEqual({
      limit: 10,
      status: "IN_PROGRESS",
      customerId: "11111111-1111-1111-1111-111111111111",
      projectCode: "WC-2026-000001",
    });
  });

  it("rejects an unknown status value", async () => {
    const { gateway } = createFakeGateway();

    await expect(
      listProjects({ limit: null, status: "NOT_A_STATUS", customerId: null, projectCode: null }, staff, gateway),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects a malformed customerId", async () => {
    const { gateway } = createFakeGateway();

    await expect(
      listProjects({ limit: null, status: null, customerId: "not-a-uuid", projectCode: null }, staff, gateway),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
