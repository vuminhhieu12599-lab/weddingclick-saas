import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { buildProjectCreationPlan } from "../build-project-creation-plan";
import type { ProjectGateway } from "../project-gateway";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "staff-1",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

const validCustomerId = "11111111-1111-1111-1111-111111111111";
const validStaffId = "22222222-2222-2222-2222-222222222222";

function createFakeGateway(): ProjectGateway<FakeClient> {
  const gateway: ProjectGateway<FakeClient> = {
    async getProjectById() {
      return null;
    },
    async listProjects() {
      return [];
    },
    async getPackageByCode(_client, code) {
      if (code === "COMMON") {
        return { id: "pkg-1", code: "COMMON", name: "Common Invitation", priceVnd: 150000, isActive: true };
      }
      if (code === "SEPARATE") {
        return { id: "pkg-2", code: "SEPARATE", name: "Separate", priceVnd: 250000, isActive: true };
      }
      return null;
    },
    async getAddonsByCodes(_client, codes) {
      if (codes.includes("PERSONALIZED_GUEST")) {
        return [
          {
            id: "addon-1",
            code: "PERSONALIZED_GUEST",
            name: "Personalized Guest Names",
            priceVnd: 50000,
            isActive: true,
          },
        ];
      }
      return [];
    },
    async getActiveStaffProfileById(_client, id) {
      return id === validStaffId ? { id: validStaffId, displayName: "Staff Two", isActive: true } : null;
    },
  };
  return gateway;
}

describe("buildProjectCreationPlan", () => {
  it("builds a plan with a DB-derived base price and no add-ons", async () => {
    const plan = await buildProjectCreationPlan(
      { customerId: validCustomerId, packageCode: "COMMON" },
      staff,
      createFakeGateway(),
    );

    expect(plan).toEqual({
      customerId: validCustomerId,
      eventType: "WEDDING",
      servicePackageId: "pkg-1",
      packageCodeSnapshot: "COMMON",
      packageNameSnapshot: "Common Invitation",
      basePriceVnd: 150000,
      addons: [],
      assignedStaffId: null,
      deadlineAt: null,
    });
  });

  it("builds a plan including a resolved add-on and assigned staff", async () => {
    const plan = await buildProjectCreationPlan(
      {
        customerId: validCustomerId,
        packageCode: "SEPARATE",
        addonCodes: ["PERSONALIZED_GUEST"],
        assignedStaffId: validStaffId,
        deadlineAt: "2026-12-01T00:00:00.000Z",
      },
      staff,
      createFakeGateway(),
    );

    expect(plan.basePriceVnd).toBe(250000);
    expect(plan.addons).toEqual([
      {
        serviceAddonId: "addon-1",
        addonCodeSnapshot: "PERSONALIZED_GUEST",
        addonNameSnapshot: "Personalized Guest Names",
        priceVndSnapshot: 50000,
      },
    ]);
    expect(plan.assignedStaffId).toBe(validStaffId);
    expect(plan.deadlineAt).toBe("2026-12-01T00:00:00.000Z");
  });

  it("rejects an inactive/missing package before resolving anything else", async () => {
    await expect(
      buildProjectCreationPlan(
        { customerId: validCustomerId, packageCode: "NOT_REAL" },
        staff,
        createFakeGateway(),
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects an assignedStaffId that is not an active staff profile", async () => {
    await expect(
      buildProjectCreationPlan(
        {
          customerId: validCustomerId,
          packageCode: "COMMON",
          assignedStaffId: "33333333-3333-3333-3333-333333333333",
        },
        staff,
        createFakeGateway(),
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("never trusts a client-supplied price/total field (rejected during request validation)", async () => {
    await expect(
      buildProjectCreationPlan(
        {
          customerId: validCustomerId,
          packageCode: "COMMON",
          basePriceVnd: 1,
        },
        staff,
        createFakeGateway(),
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
