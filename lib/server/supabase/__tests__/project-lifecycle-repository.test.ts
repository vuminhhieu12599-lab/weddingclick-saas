import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { supabaseProjectLifecycleGateway } from "../project-lifecycle-repository";

const projectId = "11111111-1111-1111-1111-111111111111";
const staffId = "22222222-2222-2222-2222-222222222222";

function fakeClientWithRpcResult(result: {
  data?: unknown;
  error?: { code: string; message: string } | null;
  captureCall?: (fn: string, params: unknown) => void;
}): SupabaseClient {
  return {
    rpc: async (fn: string, params: unknown) => {
      result.captureCall?.(fn, params);
      return { data: result.data ?? null, error: result.error ?? null };
    },
  } as unknown as SupabaseClient;
}

function omit<T extends object, K extends keyof T>(row: T, key: K): Omit<T, K> {
  const clone: Partial<T> = { ...row };
  delete clone[key];
  return clone as Omit<T, K>;
}

describe("supabaseProjectLifecycleGateway.transitionStatus", () => {
  const successRow = {
    id: projectId,
    status: "WAITING_FOR_INFO",
    completed_at: null,
    archived_at: null,
    updated_at: "2026-09-18T00:00:00.000Z",
  };

  it("calls transition_project_status with exactly p_project_id/p_target_status/p_reason", async () => {
    let captured: { fn: string; params: Record<string, unknown> } | undefined;
    const client = fakeClientWithRpcResult({
      data: [successRow],
      captureCall: (fn, params) => {
        captured = { fn, params: params as Record<string, unknown> };
      },
    });

    await supabaseProjectLifecycleGateway.transitionStatus(client, projectId, {
      targetStatus: "WAITING_FOR_INFO",
      reason: "Customer requested delay",
    });

    expect(captured?.fn).toBe("transition_project_status");
    expect(captured?.params).toEqual({
      p_project_id: projectId,
      p_target_status: "WAITING_FOR_INFO",
      p_reason: "Customer requested delay",
    });
  });

  it("maps the RPC row to a TransitionStatusResult", async () => {
    const client = fakeClientWithRpcResult({ data: [successRow] });

    const result = await supabaseProjectLifecycleGateway.transitionStatus(client, projectId, {
      targetStatus: "WAITING_FOR_INFO",
      reason: null,
    });

    expect(result).toEqual({
      id: projectId,
      status: "WAITING_FOR_INFO",
      completedAt: null,
      archivedAt: null,
      updatedAt: successRow.updated_at,
    });
  });

  it.each([
    ["PL001", "FORBIDDEN"],
    ["PL002", "NOT_FOUND"],
    ["PL003", "BAD_REQUEST"],
    ["PL004", "CONFLICT"],
    ["PL005", "INVARIANT"],
    ["PL006", "INVARIANT"],
    ["PL010", "BAD_REQUEST"],
  ])("maps known RPC error code %s to ApiError(%s) without leaking the raw message", async (code, kind) => {
    const client = fakeClientWithRpcResult({
      error: { code, message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectLifecycleGateway
      .transitionStatus(client, projectId, { targetStatus: "WAITING_FOR_INFO", reason: null })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
    expect((error as ApiError).message).not.toContain("raw postgres detail");
  });

  it("maps an unrecognized SQLSTATE to a generic error without leaking the raw message", async () => {
    const client = fakeClientWithRpcResult({
      error: { code: "23503", message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectLifecycleGateway
      .transitionStatus(client, projectId, { targetStatus: "WAITING_FOR_INFO", reason: null })
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("treats an unexpected response shape (no error, empty row array) as a generic failure", async () => {
    const client = fakeClientWithRpcResult({ data: [], error: null });

    const error = await supabaseProjectLifecycleGateway
      .transitionStatus(client, projectId, { targetStatus: "WAITING_FOR_INFO", reason: null })
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it("treats null data as a generic failure", async () => {
    const client = fakeClientWithRpcResult({ data: null, error: null });

    const error = await supabaseProjectLifecycleGateway
      .transitionStatus(client, projectId, { targetStatus: "WAITING_FOR_INFO", reason: null })
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it("treats multiple rows as a generic failure instead of silently taking the first", async () => {
    const client = fakeClientWithRpcResult({ data: [successRow, successRow], error: null });

    const error = await supabaseProjectLifecycleGateway
      .transitionStatus(client, projectId, { targetStatus: "WAITING_FOR_INFO", reason: null })
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it.each([
    ["missing required field", omit(successRow, "id")],
    ["wrong status value", { ...successRow, status: "NOT_A_REAL_STATUS" }],
    ["malformed UUID", { ...successRow, id: "not-a-uuid" }],
    ["malformed completed_at", { ...successRow, completed_at: "not-a-timestamp" }],
    ["malformed archived_at", { ...successRow, archived_at: "not-a-timestamp" }],
    ["malformed updated_at", { ...successRow, updated_at: "not-a-timestamp" }],
  ])("treats a malformed row (%s) as a generic failure without leaking the raw value", async (_label, row) => {
    const client = fakeClientWithRpcResult({ data: [row], error: null });

    const error = await supabaseProjectLifecycleGateway
      .transitionStatus(client, projectId, { targetStatus: "WAITING_FOR_INFO", reason: null })
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("not-a-uuid");
    expect((error as Error).message).not.toContain("not-a-timestamp");
    expect((error as Error).message).not.toContain("NOT_A_REAL_STATUS");
  });
});

describe("supabaseProjectLifecycleGateway.markPaid", () => {
  const successRow = {
    id: projectId,
    status: "AWAITING_PAYMENT",
    payment_status: "PAID",
    paid_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
  };

  it("calls mark_project_paid with exactly p_project_id", async () => {
    let captured: { fn: string; params: Record<string, unknown> } | undefined;
    const client = fakeClientWithRpcResult({
      data: [successRow],
      captureCall: (fn, params) => {
        captured = { fn, params: params as Record<string, unknown> };
      },
    });

    await supabaseProjectLifecycleGateway.markPaid(client, projectId);

    expect(captured?.fn).toBe("mark_project_paid");
    expect(captured?.params).toEqual({ p_project_id: projectId });
  });

  it("maps the RPC row to a MarkPaidResult", async () => {
    const client = fakeClientWithRpcResult({ data: [successRow] });

    const result = await supabaseProjectLifecycleGateway.markPaid(client, projectId);

    expect(result).toEqual({
      id: projectId,
      status: "AWAITING_PAYMENT",
      paymentStatus: "PAID",
      paidAt: successRow.paid_at,
      updatedAt: successRow.updated_at,
    });
  });

  it.each([
    ["PL001", "FORBIDDEN"],
    ["PL002", "NOT_FOUND"],
    ["PL006", "INVARIANT"],
    ["PL007", "CONFLICT"],
  ])("maps known RPC error code %s to ApiError(%s) without leaking the raw message", async (code, kind) => {
    const client = fakeClientWithRpcResult({
      error: { code, message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectLifecycleGateway
      .markPaid(client, projectId)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
    expect((error as ApiError).message).not.toContain("raw postgres detail");
  });

  it("maps an unrecognized SQLSTATE to a generic error without leaking the raw message", async () => {
    const client = fakeClientWithRpcResult({
      error: { code: "40001", message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectLifecycleGateway
      .markPaid(client, projectId)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("treats an unexpected response shape as a generic failure", async () => {
    const client = fakeClientWithRpcResult({ data: [], error: null });

    const error = await supabaseProjectLifecycleGateway
      .markPaid(client, projectId)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it("treats null data as a generic failure", async () => {
    const client = fakeClientWithRpcResult({ data: null, error: null });

    const error = await supabaseProjectLifecycleGateway
      .markPaid(client, projectId)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it("treats multiple rows as a generic failure instead of silently taking the first", async () => {
    const client = fakeClientWithRpcResult({ data: [successRow, successRow], error: null });

    const error = await supabaseProjectLifecycleGateway
      .markPaid(client, projectId)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it.each([
    ["missing required field", omit(successRow, "paid_at")],
    ["wrong status value", { ...successRow, status: "NOT_A_REAL_STATUS" }],
    ["wrong payment_status value", { ...successRow, payment_status: "REFUNDED" }],
    ["malformed UUID", { ...successRow, id: "not-a-uuid" }],
    ["malformed paid_at", { ...successRow, paid_at: "not-a-timestamp" }],
    ["malformed updated_at", { ...successRow, updated_at: "not-a-timestamp" }],
  ])("treats a malformed row (%s) as a generic failure without leaking the raw value", async (_label, row) => {
    const client = fakeClientWithRpcResult({ data: [row], error: null });

    const error = await supabaseProjectLifecycleGateway
      .markPaid(client, projectId)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("not-a-uuid");
    expect((error as Error).message).not.toContain("not-a-timestamp");
    expect((error as Error).message).not.toContain("NOT_A_REAL_STATUS");
    expect((error as Error).message).not.toContain("REFUNDED");
  });
});

describe("supabaseProjectLifecycleGateway.reassignStaff", () => {
  const successRow = {
    id: projectId,
    assigned_staff_id: staffId,
    updated_at: "2026-09-18T00:00:00.000Z",
  };

  it("calls reassign_project_staff with exactly p_project_id/p_assigned_staff_id", async () => {
    let captured: { fn: string; params: Record<string, unknown> } | undefined;
    const client = fakeClientWithRpcResult({
      data: [successRow],
      captureCall: (fn, params) => {
        captured = { fn, params: params as Record<string, unknown> };
      },
    });

    await supabaseProjectLifecycleGateway.reassignStaff(client, projectId, {
      assignedStaffId: staffId,
    });

    expect(captured?.fn).toBe("reassign_project_staff");
    expect(captured?.params).toEqual({
      p_project_id: projectId,
      p_assigned_staff_id: staffId,
    });
  });

  it("passes null through as p_assigned_staff_id (unassign)", async () => {
    let captured: { params: Record<string, unknown> } | undefined;
    const client = fakeClientWithRpcResult({
      data: [{ ...successRow, assigned_staff_id: null }],
      captureCall: (_fn, params) => {
        captured = { params: params as Record<string, unknown> };
      },
    });

    await supabaseProjectLifecycleGateway.reassignStaff(client, projectId, {
      assignedStaffId: null,
    });

    expect(captured?.params).toEqual({ p_project_id: projectId, p_assigned_staff_id: null });
  });

  it("maps the RPC row to a ReassignStaffResult", async () => {
    const client = fakeClientWithRpcResult({ data: [successRow] });

    const result = await supabaseProjectLifecycleGateway.reassignStaff(client, projectId, {
      assignedStaffId: staffId,
    });

    expect(result).toEqual({
      id: projectId,
      assignedStaffId: staffId,
      updatedAt: successRow.updated_at,
    });
  });

  it.each([
    ["PL001", "FORBIDDEN"],
    ["PL002", "NOT_FOUND"],
    ["PL008", "CONFLICT"],
    ["PL009", "INVARIANT"],
  ])("maps known RPC error code %s to ApiError(%s) without leaking the raw message", async (code, kind) => {
    const client = fakeClientWithRpcResult({
      error: { code, message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectLifecycleGateway
      .reassignStaff(client, projectId, { assignedStaffId: staffId })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
    expect((error as ApiError).message).not.toContain("raw postgres detail");
  });

  it("maps an unrecognized SQLSTATE to a generic error without leaking the raw message", async () => {
    const client = fakeClientWithRpcResult({
      error: { code: "40P01", message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectLifecycleGateway
      .reassignStaff(client, projectId, { assignedStaffId: staffId })
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("treats an unexpected response shape as a generic failure", async () => {
    const client = fakeClientWithRpcResult({ data: [], error: null });

    const error = await supabaseProjectLifecycleGateway
      .reassignStaff(client, projectId, { assignedStaffId: staffId })
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it("treats null data as a generic failure", async () => {
    const client = fakeClientWithRpcResult({ data: null, error: null });

    const error = await supabaseProjectLifecycleGateway
      .reassignStaff(client, projectId, { assignedStaffId: staffId })
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it("treats multiple rows as a generic failure instead of silently taking the first", async () => {
    const client = fakeClientWithRpcResult({ data: [successRow, successRow], error: null });

    const error = await supabaseProjectLifecycleGateway
      .reassignStaff(client, projectId, { assignedStaffId: staffId })
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it.each([
    ["missing required field", omit(successRow, "updated_at")],
    ["malformed UUID id", { ...successRow, id: "not-a-uuid" }],
    ["malformed assigned_staff_id", { ...successRow, assigned_staff_id: "not-a-uuid" }],
    ["malformed updated_at", { ...successRow, updated_at: "not-a-timestamp" }],
  ])("treats a malformed row (%s) as a generic failure without leaking the raw value", async (_label, row) => {
    const client = fakeClientWithRpcResult({ data: [row], error: null });

    const error = await supabaseProjectLifecycleGateway
      .reassignStaff(client, projectId, { assignedStaffId: staffId })
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("not-a-uuid");
    expect((error as Error).message).not.toContain("not-a-timestamp");
  });
});
