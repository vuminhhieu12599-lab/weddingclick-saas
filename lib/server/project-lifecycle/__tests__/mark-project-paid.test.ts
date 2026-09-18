import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { markProjectPaid } from "../mark-project-paid";
import type { ProjectLifecycleGateway } from "../project-lifecycle-gateway";
import type { MarkPaidResult } from "../project-lifecycle-types";

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

function unusedGatewayMethods(): Pick<
  ProjectLifecycleGateway<FakeClient>,
  "transitionStatus" | "reassignStaff"
> {
  return {
    async transitionStatus() {
      throw new Error("should not be called");
    },
    async reassignStaff() {
      throw new Error("should not be called");
    },
  };
}

describe("markProjectPaid", () => {
  it("validates the body, then calls the gateway once with the project id", async () => {
    let callCount = 0;
    let receivedProjectId: string | undefined;

    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async markPaid(_client, pid) {
        callCount += 1;
        receivedProjectId = pid;
        const result: MarkPaidResult = {
          id: pid,
          status: "AWAITING_PAYMENT",
          paymentStatus: "PAID",
          paidAt: "2026-09-18T00:00:00.000Z",
          updatedAt: "2026-09-18T00:00:00.000Z",
        };
        return result;
      },
    };

    const result = await markProjectPaid(projectId, { action: "MARK_PAID" }, staff, gateway);

    expect(callCount).toBe(1);
    expect(receivedProjectId).toBe(projectId);
    expect(result.paymentStatus).toBe("PAID");
  });

  it("rejects a malformed project id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async markPaid() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await markProjectPaid(
      "not-a-uuid",
      { action: "MARK_PAID" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a wrong action as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async markPaid() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await markProjectPaid(
      projectId,
      { action: "MARK_UNPAID" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("propagates a CONFLICT ApiError raised by the gateway (already paid)", async () => {
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async markPaid() {
        throw new ApiError("CONFLICT", "Project is already marked paid");
      },
    };

    const error = await markProjectPaid(
      projectId,
      { action: "MARK_PAID" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
  });

  it("propagates an INVARIANT ApiError raised by the gateway (wrong lifecycle status)", async () => {
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async markPaid() {
        throw new ApiError("INVARIANT", "Project payment status does not allow this operation");
      },
    };

    const error = await markProjectPaid(
      projectId,
      { action: "MARK_PAID" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INVARIANT");
  });

  it("propagates a NOT_FOUND ApiError raised by the gateway", async () => {
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async markPaid() {
        throw new ApiError("NOT_FOUND", "Project not found");
      },
    };

    const error = await markProjectPaid(
      projectId,
      { action: "MARK_PAID" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });
});
