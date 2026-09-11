import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { getProjectById } from "../get-project";
import type { ProjectGateway } from "../project-gateway";
import type { ProjectSummary } from "../project-types";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "staff-1",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

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

function createFakeGateway(project: ProjectSummary | null): ProjectGateway<FakeClient> {
  return {
    async getProjectById(_client, id) {
      return project && project.id === id ? project : null;
    },
    async listProjects() {
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
  };
}

describe("getProjectById", () => {
  it("returns the project, including DB-derived totals, when found", async () => {
    const gateway = createFakeGateway(existingProject);

    const result = await getProjectById(existingProject.id, staff, gateway);

    expect(result).toEqual(existingProject);
    expect(result.status).toBe("NEW");
    expect(result.paymentStatus).toBe("UNPAID");
    expect(result.totalPriceVnd).toBe(result.basePriceVnd + result.addonTotalVnd);
  });

  it("maps a missing project to ApiError NOT_FOUND", async () => {
    const gateway = createFakeGateway(null);

    const error = await getProjectById(existingProject.id, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("rejects a malformed id as BAD_REQUEST without querying the gateway", async () => {
    let called = false;
    const gateway: ProjectGateway<FakeClient> = {
      async getProjectById() {
        called = true;
        return null;
      },
      async listProjects() {
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
    };

    const error = await getProjectById("not-a-uuid", staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });
});
