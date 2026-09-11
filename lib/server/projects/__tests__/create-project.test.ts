import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { createProject } from "../create-project";
import type { ProjectGateway } from "../project-gateway";
import type { CreateProjectRpcParams } from "../project-types";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "staff-user-1",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

function createFakeGateway(
  createProjectImpl: ProjectGateway<FakeClient>["createProject"],
): ProjectGateway<FakeClient> {
  return {
    async getProjectById() {
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
    createProject: createProjectImpl,
  };
}

const validBody = {
  customerId: "11111111-1111-1111-1111-111111111111",
  packageCode: "COMMON",
  addonCodes: ["PERSONALIZED_GUEST"],
  assignedStaffId: null,
  deadlineAt: null,
};

describe("createProject (Task 005B use case)", () => {
  it("forwards only business-intent fields to the gateway, never staff.userId/createdBy", async () => {
    let received: CreateProjectRpcParams | undefined;
    const gateway = createFakeGateway(async (_client, params) => {
      received = params;
      return { id: "22222222-2222-2222-2222-222222222222" };
    });

    const result = await createProject(validBody, staff, gateway);

    expect(result).toEqual({ id: "22222222-2222-2222-2222-222222222222" });
    expect(received).toEqual({
      customerId: validBody.customerId,
      packageCode: validBody.packageCode,
      addonCodes: validBody.addonCodes,
      assignedStaffId: null,
      deadlineAt: null,
    });
    expect(received).not.toHaveProperty("createdBy");
    expect(JSON.stringify(received)).not.toContain(staff.userId);
  });

  it("rejects a forbidden field (createdBy) before ever calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway(async () => {
      called = true;
      return { id: "should-not-be-reached" };
    });

    const error = await createProject(
      { ...validBody, createdBy: staff.userId },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a forbidden server-derived price field before ever calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway(async () => {
      called = true;
      return { id: "should-not-be-reached" };
    });

    const error = await createProject(
      { ...validBody, totalPriceVnd: 200000 },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("propagates a gateway ApiError unchanged", async () => {
    const gateway = createFakeGateway(async () => {
      throw new ApiError("CONFLICT", "Package is not currently active");
    });

    const error = await createProject(validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
  });
});
