import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectLifecycleGateway } from "../../project-lifecycle/project-lifecycle-gateway";
import type {
  MarkPaidResult,
  ReassignStaffResult,
  TransitionStatusResult,
} from "../../project-lifecycle/project-lifecycle-types";
import {
  handleMarkProjectPaidRequest,
  handleReassignProjectStaffRequest,
  handleTransitionProjectStatusRequest,
} from "../project-lifecycle";

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

const activeStaffAuth = createFakeAuthGateway({
  userId: "staff-1",
  profile: { role: "STAFF", displayName: "Test Staff" },
});

const existingProjectId = "11111111-1111-1111-1111-111111111111";
const targetStaffId = "22222222-2222-2222-2222-222222222222";

function createFakeGateway(options?: {
  transitionStatus?: ProjectLifecycleGateway<FakeClient>["transitionStatus"];
  markPaid?: ProjectLifecycleGateway<FakeClient>["markPaid"];
  reassignStaff?: ProjectLifecycleGateway<FakeClient>["reassignStaff"];
}): ProjectLifecycleGateway<FakeClient> {
  return {
    async transitionStatus(client, pid, input) {
      if (options?.transitionStatus) {
        return options.transitionStatus(client, pid, input);
      }
      const result: TransitionStatusResult = {
        id: pid,
        status: input.targetStatus,
        completedAt: null,
        archivedAt: null,
        updatedAt: "2026-09-18T00:00:00.000Z",
      };
      return result;
    },
    async markPaid(client, pid) {
      if (options?.markPaid) {
        return options.markPaid(client, pid);
      }
      const result: MarkPaidResult = {
        id: pid,
        status: "AWAITING_PAYMENT",
        paymentStatus: "PAID",
        paidAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
      };
      return result;
    },
    async reassignStaff(client, pid, input) {
      if (options?.reassignStaff) {
        return options.reassignStaff(client, pid, input);
      }
      const result: ReassignStaffResult = {
        id: pid,
        assignedStaffId: input.assignedStaffId,
        updatedAt: "2026-09-18T00:00:00.000Z",
      };
      return result;
    },
  };
}

describe("handleTransitionProjectStatusRequest", () => {
  it("returns 200 with the exact documented response shape", async () => {
    const result = await handleTransitionProjectStatusRequest(
      "Bearer good-token",
      existingProjectId,
      { targetStatus: "WAITING_FOR_INFO" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      data: {
        id: existingProjectId,
        status: "WAITING_FOR_INFO",
        completedAt: null,
        archivedAt: null,
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    });
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleTransitionProjectStatusRequest(
      null,
      existingProjectId,
      { targetStatus: "NEW" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 401 for an invalid bearer token", async () => {
    const noUserAuth = createFakeAuthGateway({ userId: null });

    const result = await handleTransitionProjectStatusRequest(
      "Bearer bad-token",
      existingProjectId,
      { targetStatus: "NEW" },
      noUserAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleTransitionProjectStatusRequest(
      "Bearer token",
      existingProjectId,
      { targetStatus: "NEW" },
      noProfileAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed project id", async () => {
    const result = await handleTransitionProjectStatusRequest(
      "Bearer good-token",
      "not-a-uuid",
      { targetStatus: "NEW" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 400 for a malformed body", async () => {
    const result = await handleTransitionProjectStatusRequest(
      "Bearer good-token",
      existingProjectId,
      { targetStatus: "NOT_A_STATUS" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 400 for an unknown field", async () => {
    const result = await handleTransitionProjectStatusRequest(
      "Bearer good-token",
      existingProjectId,
      { targetStatus: "NEW", extra: "field" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 404 when the RPC reports the Project does not exist", async () => {
    const gateway = createFakeGateway({
      transitionStatus: async () => {
        throw new ApiError("NOT_FOUND", "Project not found");
      },
    });

    const result = await handleTransitionProjectStatusRequest(
      "Bearer good-token",
      existingProjectId,
      { targetStatus: "NEW" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
  });

  it("returns 409 when the RPC reports a same-status conflict", async () => {
    const gateway = createFakeGateway({
      transitionStatus: async () => {
        throw new ApiError("CONFLICT", "Project already has the requested status");
      },
    });

    const result = await handleTransitionProjectStatusRequest(
      "Bearer good-token",
      existingProjectId,
      { targetStatus: "NEW" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(409);
  });

  it("returns 422 when the RPC reports an illegal/reserved transition", async () => {
    const gateway = createFakeGateway({
      transitionStatus: async () => {
        throw new ApiError("INVARIANT", "That status transition is not allowed");
      },
    });

    const result = await handleTransitionProjectStatusRequest(
      "Bearer good-token",
      existingProjectId,
      { targetStatus: "PUBLISHED" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(422);
  });

  it("a reserved target (e.g. CUSTOMER_REVIEW) is syntactically accepted by the validator and reaches the gateway", async () => {
    let receivedTargetStatus: string | undefined;
    const gateway = createFakeGateway({
      transitionStatus: async (_client, _pid, input) => {
        receivedTargetStatus = input.targetStatus;
        throw new ApiError("INVARIANT", "That status transition is not allowed");
      },
    });

    const result = await handleTransitionProjectStatusRequest(
      "Bearer good-token",
      existingProjectId,
      { targetStatus: "CUSTOMER_REVIEW" },
      activeStaffAuth,
      gateway,
    );

    expect(receivedTargetStatus).toBe("CUSTOMER_REVIEW");
    expect(result.status).toBe(422);
  });

  it("returns 422 when the RPC reports the READY_TO_PUBLISH payment precondition", async () => {
    const gateway = createFakeGateway({
      transitionStatus: async () => {
        throw new ApiError("INVARIANT", "Project payment status does not allow this operation");
      },
    });

    const result = await handleTransitionProjectStatusRequest(
      "Bearer good-token",
      existingProjectId,
      { targetStatus: "READY_TO_PUBLISH" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(422);
  });

  it("maps an unexpected gateway failure to a generic 500 without leaking details", async () => {
    const gateway = createFakeGateway({
      transitionStatus: async () => {
        throw new Error("relation internal constraint detail");
      },
    });

    const result = await handleTransitionProjectStatusRequest(
      "Bearer good-token",
      existingProjectId,
      { targetStatus: "NEW" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });
});

describe("handleMarkProjectPaidRequest", () => {
  it("returns 200 with the exact documented response shape", async () => {
    const result = await handleMarkProjectPaidRequest(
      "Bearer good-token",
      existingProjectId,
      { action: "MARK_PAID" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      data: {
        id: existingProjectId,
        status: "AWAITING_PAYMENT",
        paymentStatus: "PAID",
        paidAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    });
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleMarkProjectPaidRequest(
      null,
      existingProjectId,
      { action: "MARK_PAID" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 401 for an invalid bearer token", async () => {
    const noUserAuth = createFakeAuthGateway({ userId: null });

    const result = await handleMarkProjectPaidRequest(
      "Bearer bad-token",
      existingProjectId,
      { action: "MARK_PAID" },
      noUserAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleMarkProjectPaidRequest(
      "Bearer token",
      existingProjectId,
      { action: "MARK_PAID" },
      noProfileAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed project id", async () => {
    const result = await handleMarkProjectPaidRequest(
      "Bearer good-token",
      "not-a-uuid",
      { action: "MARK_PAID" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 400 for a wrong action", async () => {
    const result = await handleMarkProjectPaidRequest(
      "Bearer good-token",
      existingProjectId,
      { action: "MARK_UNPAID" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 400 for an empty body", async () => {
    const result = await handleMarkProjectPaidRequest(
      "Bearer good-token",
      existingProjectId,
      {},
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 404 when the RPC reports the Project does not exist", async () => {
    const gateway = createFakeGateway({
      markPaid: async () => {
        throw new ApiError("NOT_FOUND", "Project not found");
      },
    });

    const result = await handleMarkProjectPaidRequest(
      "Bearer good-token",
      existingProjectId,
      { action: "MARK_PAID" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
  });

  it("returns 409 when the RPC reports the Project is already paid", async () => {
    const gateway = createFakeGateway({
      markPaid: async () => {
        throw new ApiError("CONFLICT", "Project is already marked paid");
      },
    });

    const result = await handleMarkProjectPaidRequest(
      "Bearer good-token",
      existingProjectId,
      { action: "MARK_PAID" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(409);
  });

  it("returns 422 when the RPC reports the wrong lifecycle status", async () => {
    const gateway = createFakeGateway({
      markPaid: async () => {
        throw new ApiError("INVARIANT", "Project payment status does not allow this operation");
      },
    });

    const result = await handleMarkProjectPaidRequest(
      "Bearer good-token",
      existingProjectId,
      { action: "MARK_PAID" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(422);
  });

  it("maps an unexpected gateway failure to a generic 500 without leaking details", async () => {
    const gateway = createFakeGateway({
      markPaid: async () => {
        throw new Error("relation internal constraint detail");
      },
    });

    const result = await handleMarkProjectPaidRequest(
      "Bearer good-token",
      existingProjectId,
      { action: "MARK_PAID" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });
});

describe("handleReassignProjectStaffRequest", () => {
  it("returns 200 with the exact documented response shape", async () => {
    const result = await handleReassignProjectStaffRequest(
      "Bearer good-token",
      existingProjectId,
      { assignedStaffId: targetStaffId },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      data: {
        id: existingProjectId,
        assignedStaffId: targetStaffId,
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    });
  });

  it("returns 200 with assignedStaffId: null for an unassign", async () => {
    const result = await handleReassignProjectStaffRequest(
      "Bearer good-token",
      existingProjectId,
      { assignedStaffId: null },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      data: {
        id: existingProjectId,
        assignedStaffId: null,
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    });
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleReassignProjectStaffRequest(
      null,
      existingProjectId,
      { assignedStaffId: targetStaffId },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 401 for an invalid bearer token", async () => {
    const noUserAuth = createFakeAuthGateway({ userId: null });

    const result = await handleReassignProjectStaffRequest(
      "Bearer bad-token",
      existingProjectId,
      { assignedStaffId: targetStaffId },
      noUserAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleReassignProjectStaffRequest(
      "Bearer token",
      existingProjectId,
      { assignedStaffId: targetStaffId },
      noProfileAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed project id", async () => {
    const result = await handleReassignProjectStaffRequest(
      "Bearer good-token",
      "not-a-uuid",
      { assignedStaffId: targetStaffId },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 400 for a malformed assignedStaffId", async () => {
    const result = await handleReassignProjectStaffRequest(
      "Bearer good-token",
      existingProjectId,
      { assignedStaffId: "not-a-uuid" },
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 400 for a missing assignedStaffId key", async () => {
    const result = await handleReassignProjectStaffRequest(
      "Bearer good-token",
      existingProjectId,
      {},
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 404 when the RPC reports the Project does not exist", async () => {
    const gateway = createFakeGateway({
      reassignStaff: async () => {
        throw new ApiError("NOT_FOUND", "Project not found");
      },
    });

    const result = await handleReassignProjectStaffRequest(
      "Bearer good-token",
      existingProjectId,
      { assignedStaffId: targetStaffId },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
  });

  it("returns 409 when the RPC reports the same assignment (no-op)", async () => {
    const gateway = createFakeGateway({
      reassignStaff: async () => {
        throw new ApiError("CONFLICT", "Project is already assigned to that staff member");
      },
    });

    const result = await handleReassignProjectStaffRequest(
      "Bearer good-token",
      existingProjectId,
      { assignedStaffId: targetStaffId },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(409);
  });

  it("returns 422 when the RPC reports a missing/inactive/non-staff assignee", async () => {
    const gateway = createFakeGateway({
      reassignStaff: async () => {
        throw new ApiError(
          "INVARIANT",
          "Assigned staff member must be an active STAFF or ADMIN profile",
        );
      },
    });

    const result = await handleReassignProjectStaffRequest(
      "Bearer good-token",
      existingProjectId,
      { assignedStaffId: targetStaffId },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(422);
  });

  it("maps an unexpected gateway failure to a generic 500 without leaking details", async () => {
    const gateway = createFakeGateway({
      reassignStaff: async () => {
        throw new Error("relation internal constraint detail");
      },
    });

    const result = await handleReassignProjectStaffRequest(
      "Bearer good-token",
      existingProjectId,
      { assignedStaffId: targetStaffId },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });
});
