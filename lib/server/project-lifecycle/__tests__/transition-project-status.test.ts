import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectLifecycleGateway } from "../project-lifecycle-gateway";
import type { TransitionStatusResult } from "../project-lifecycle-types";
import { transitionProjectStatus } from "../transition-project-status";

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
  "markPaid" | "reassignStaff"
> {
  return {
    async markPaid() {
      throw new Error("should not be called");
    },
    async reassignStaff() {
      throw new Error("should not be called");
    },
  };
}

describe("transitionProjectStatus", () => {
  it("validates the body, then calls the gateway once with the project id and normalized input", async () => {
    let callCount = 0;
    let received: { projectId: string; input: unknown } | undefined;

    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async transitionStatus(_client, pid, input) {
        callCount += 1;
        received = { projectId: pid, input };
        const result: TransitionStatusResult = {
          id: pid,
          status: input.targetStatus,
          completedAt: null,
          archivedAt: null,
          updatedAt: "2026-09-18T00:00:00.000Z",
        };
        return result;
      },
    };

    const result = await transitionProjectStatus(
      projectId,
      { targetStatus: "WAITING_FOR_INFO", reason: "  ready  " },
      staff,
      gateway,
    );

    expect(callCount).toBe(1);
    expect(received?.projectId).toBe(projectId);
    expect(received?.input).toEqual({ targetStatus: "WAITING_FOR_INFO", reason: "ready" });
    expect(result.status).toBe("WAITING_FOR_INFO");
  });

  it("rejects a malformed project id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async transitionStatus() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await transitionProjectStatus(
      "not-a-uuid",
      { targetStatus: "NEW" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a malformed body as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async transitionStatus() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await transitionProjectStatus(
      projectId,
      { targetStatus: "NOT_A_STATUS" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("passes a reserved target (e.g. PUBLISHED) through to the gateway rather than rejecting it locally", async () => {
    let received: string | undefined;
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async transitionStatus(_client, _pid, input) {
        received = input.targetStatus;
        throw new ApiError("INVARIANT", "That status transition is not allowed");
      },
    };

    const error = await transitionProjectStatus(
      projectId,
      { targetStatus: "PUBLISHED" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(received).toBe("PUBLISHED");
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INVARIANT");
  });

  it("propagates a CONFLICT ApiError raised by the gateway (same-status no-op)", async () => {
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async transitionStatus() {
        throw new ApiError("CONFLICT", "Project already has the requested status");
      },
    };

    const error = await transitionProjectStatus(
      projectId,
      { targetStatus: "NEW" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
  });

  it("propagates a NOT_FOUND ApiError raised by the gateway", async () => {
    const gateway: ProjectLifecycleGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async transitionStatus() {
        throw new ApiError("NOT_FOUND", "Project not found");
      },
    };

    const error = await transitionProjectStatus(
      projectId,
      { targetStatus: "NEW" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });
});
