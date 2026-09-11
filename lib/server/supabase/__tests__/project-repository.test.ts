import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { supabaseProjectGateway } from "../project-repository";

/**
 * Unit tests for supabaseProjectGateway.createProject (Task 005B) — the only
 * place that translates create_project_with_addons' stable WCxxx SQLSTATE
 * contract (lib/server/projects/create-project-error-codes.ts) into an
 * ApiError, or an unexpected DB failure into a generic Error.
 *
 * Uses a minimal fake client exposing only `.rpc(...)`, since that is the
 * only client method this repository method calls — no real Supabase/network
 * dependency (docs/DEVELOPMENT_RULES.md "no live Supabase in this phase").
 */
function fakeClientWithRpcResult(result: {
  data?: unknown;
  error?: { code: string; message: string } | null;
}): SupabaseClient {
  return {
    rpc: async () => ({ data: result.data ?? null, error: result.error ?? null }),
  } as unknown as SupabaseClient;
}

const validParams = {
  customerId: "11111111-1111-1111-1111-111111111111",
  packageCode: "COMMON",
  addonCodes: ["PERSONALIZED_GUEST"],
  assignedStaffId: null,
  deadlineAt: null,
};

describe("supabaseProjectGateway.createProject", () => {
  it("returns the created id on success", async () => {
    const client = fakeClientWithRpcResult({ data: "22222222-2222-2222-2222-222222222222" });

    const result = await supabaseProjectGateway.createProject(client, validParams);

    expect(result).toEqual({ id: "22222222-2222-2222-2222-222222222222" });
  });

  it.each([
    ["WC001", "NOT_FOUND", "Customer not found"],
    ["WC002", "NOT_FOUND", "Package not found"],
    ["WC003", "CONFLICT", "Package is not currently active"],
    ["WC004", "BAD_REQUEST", "Duplicate addon code in request"],
    ["WC005", "NOT_FOUND", "Add-on not found"],
    ["WC006", "CONFLICT", "Add-on is not currently active"],
    [
      "WC007",
      "NOT_FOUND",
      "assignedStaffId does not resolve to an active WeddingClick staff profile",
    ],
    ["WC008", "FORBIDDEN", "Active WeddingClick staff role required"],
  ])("maps known RPC error code %s to ApiError(%s)", async (code, kind, message) => {
    const client = fakeClientWithRpcResult({
      error: { code, message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectGateway
      .createProject(client, validParams)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
    expect((error as ApiError).message).toBe(message);
    expect((error as ApiError).message).not.toContain("raw postgres detail");
  });

  it("maps an unrecognized SQLSTATE to a generic error without leaking the raw message", async () => {
    const client = fakeClientWithRpcResult({
      error: { code: "23503", message: "insert or update on table violates foreign key ..." },
    });

    const error = await supabaseProjectGateway
      .createProject(client, validParams)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("foreign key");
  });

  it("treats an unexpected response shape (no error, non-string data) as a generic failure", async () => {
    const client = fakeClientWithRpcResult({ data: null, error: null });

    const error = await supabaseProjectGateway
      .createProject(client, validParams)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });
});
