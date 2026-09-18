import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectLifecycleGateway } from "../project-lifecycle-gateway";
import type { ReassignStaffResult } from "../project-lifecycle-types";
import { reassignProjectStaff } from "../reassign-project-staff";

interface FakeClient {
  marker: string;
}

const staff: StaffContext<FakeClient> = {
  userId: "staff-1",
  role: "STAFF",
  displayName: "Test Staff",
  supabase: { marker: "fake" },
};

const projectId = "11111111-1111-1111-1111-111111111111";
const targetStaffId = "22222222-2222-2222-2222-222222222222";

function unusedGatewayMethods(): Pick<
  ProjectLifecycleGateway<FakeClient>,
  "transitionStatus" | "markPaid"
> {
  return {
    async transitionStatus() {
      throw new Error("should not be called");
    },
    async markPaid() {
      throw new Error("should not be called");
    },
  };
}

describe("reassignProjectStaff", () => {
  it("validates the body, then calls the gateway once with the project id and parsed input", async () => {
    let callCount = 0;
    let received: { projectId: string; input: unknown } | undefined;

    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async reassignStaff(_client, pid, input) {
        callCount += 1;
        received = { projectId: pid, input };
        const result: ReassignStaffResult = {
          id: pid,
          assignedStaffId: input.assignedStaffId,
          updatedAt: "2026-09-18T00:00:00.000Z",
        };
        return result;
      },
    };

    const result = await reassignProjectStaff(
      projectId,
      { assignedStaffId: targetStaffId },
      staff,
      gateway,
    );

    expect(callCount).toBe(1);
    expect(received?.projectId).toBe(projectId);
    expect(received?.input).toEqual({ assignedStaffId: targetStaffId });
    expect(result.assignedStaffId).toBe(targetStaffId);
  });

  it("passes null through to the gateway (unassign)", async () => {
    let received: unknown;
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async reassignStaff(_client, pid, input) {
        received = input;
        const result: ReassignStaffResult = {
          id: pid,
          assignedStaffId: null,
          updatedAt: "2026-09-18T00:00:00.000Z",
        };
        return result;
      },
    };

    const result = await reassignProjectStaff(
      projectId,
      { assignedStaffId: null },
      staff,
      gateway,
    );

    expect(received).toEqual({ assignedStaffId: null });
    expect(result.assignedStaffId).toBeNull();
  });

  it("rejects a malformed project id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async reassignStaff() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await reassignProjectStaff(
      "not-a-uuid",
      { assignedStaffId: targetStaffId },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a malformed assignedStaffId as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async reassignStaff() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await reassignProjectStaff(
      projectId,
      { assignedStaffId: "not-a-uuid" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("propagates a CONFLICT ApiError raised by the gateway (same assignment no-op)", async () => {
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async reassignStaff() {
        throw new ApiError("CONFLICT", "Project is already assigned to that staff member");
      },
    };

    const error = await reassignProjectStaff(
      projectId,
      { assignedStaffId: targetStaffId },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
  });

  it("propagates an INVARIANT ApiError raised by the gateway (inactive/non-staff assignee)", async () => {
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async reassignStaff() {
        throw new ApiError(
          "INVARIANT",
          "Assigned staff member must be an active STAFF or ADMIN profile",
        );
      },
    };

    const error = await reassignProjectStaff(
      projectId,
      { assignedStaffId: targetStaffId },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INVARIANT");
  });

  it("propagates a NOT_FOUND ApiError raised by the gateway", async () => {
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async reassignStaff() {
        throw new ApiError("NOT_FOUND", "Project not found");
      },
    };

    const error = await reassignProjectStaff(
      projectId,
      { assignedStaffId: targetStaffId },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });
});
