import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { supabaseIntakeStaffGateway } from "../intake-staff-repository";

const projectId = "11111111-1111-1111-1111-111111111111";
const submissionId = "22222222-2222-2222-2222-222222222222";
const staffId = "33333333-3333-3333-3333-333333333333";

const validPayload = {
  groomName: "Nguyễn Văn Hiếu",
  brideName: "Trần Thị Bình",
  groomFather: null,
  groomMother: null,
  brideFather: null,
  brideMother: null,
  groomFamilyAddress: null,
  brideFamilyAddress: null,
  invitationMessage: null,
  loveStory: null,
  lunarDateDisplay: null,
  additionalNote: null,
  groomBankName: null,
  groomBankAccountName: null,
  groomBankAccountNumber: null,
  groomBankQrMediaId: null,
  brideBankName: null,
  brideBankAccountName: null,
  brideBankAccountNumber: null,
  brideBankQrMediaId: null,
};

const validRow = {
  id: submissionId,
  project_id: projectId,
  access_link_id: null,
  payload: validPayload,
  status: "PENDING",
  submitted_at: "2026-09-19T00:00:00.000Z",
  reviewed_by: null,
  reviewed_at: null,
  staff_note: null,
};

interface Captured {
  table?: string;
  selectColumns?: string;
  eqCalls: Array<{ column: string; value: unknown }>;
  orderCalls: Array<{ column: string; ascending: boolean }>;
}

/** Minimal fake supporting the exact list query chain: select().eq().order().order() (thenable). */
function fakeListClient(options: {
  data?: unknown;
  error?: { message: string } | null;
  captured: Captured;
}): SupabaseClient {
  const { data, error, captured } = options;
  const result = { data: data ?? [], error: error ?? null };
  function orderChain() {
    return {
      order(column: string, opts: { ascending: boolean }) {
        captured.orderCalls.push({ column, ascending: opts.ascending });
        return orderChain();
      },
      then(resolve: (value: typeof result) => void) {
        resolve(result);
      },
    };
  }
  return {
    from(table: string) {
      captured.table = table;
      return {
        select(columns: string) {
          captured.selectColumns = columns;
          return {
            eq(column: string, value: unknown) {
              captured.eqCalls.push({ column, value });
              return orderChain();
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

function fakeDetailClient(options: {
  maybeSingleResult?: { data?: unknown; error?: { message: string } | null };
  captured: Captured;
}): SupabaseClient {
  const { maybeSingleResult, captured } = options;
  return {
    from(table: string) {
      captured.table = table;
      return {
        select(columns: string) {
          captured.selectColumns = columns;
          return {
            eq(column: string, value: unknown) {
              captured.eqCalls.push({ column, value });
              return {
                eq(column2: string, value2: unknown) {
                  captured.eqCalls.push({ column: column2, value: value2 });
                  return {
                    async maybeSingle() {
                      return maybeSingleResult ?? { data: null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

function fakeRpcClient(result: {
  data?: unknown;
  error?: { code: string; message: string } | null;
  captureCall?: (fn: string, params: Record<string, unknown>) => void;
}): SupabaseClient {
  return {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      result.captureCall?.(fn, params);
      return { data: result.data ?? null, error: result.error ?? null };
    },
  } as unknown as SupabaseClient;
}

describe("supabaseIntakeStaffGateway.projectExists", () => {
  it("returns true when a row is found", async () => {
    const simpleClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            async maybeSingle() {
              return { data: { id: projectId }, error: null };
            },
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await supabaseIntakeStaffGateway.projectExists(simpleClient, projectId)).toBe(true);
  });

  it("returns false when no row is found", async () => {
    const simpleClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            async maybeSingle() {
              return { data: null, error: null };
            },
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    expect(await supabaseIntakeStaffGateway.projectExists(simpleClient, projectId)).toBe(false);
  });
});

describe("supabaseIntakeStaffGateway.listIntakeSubmissionsByProjectId", () => {
  it("queries intake_submissions scoped to the project, ordered newest-first with id tiebreaker", async () => {
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeListClient({ data: [validRow], captured });

    const result = await supabaseIntakeStaffGateway.listIntakeSubmissionsByProjectId(
      client,
      projectId,
    );

    expect(captured.table).toBe("intake_submissions");
    expect(captured.eqCalls).toEqual([{ column: "project_id", value: projectId }]);
    expect(captured.orderCalls).toEqual([
      { column: "submitted_at", ascending: false },
      { column: "id", ascending: true },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(submissionId);
    expect(result[0].weddingDetails).toEqual(validPayload);
  });

  it("never selects token/token_hash/token_hint columns", async () => {
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeListClient({ data: [], captured });
    await supabaseIntakeStaffGateway.listIntakeSubmissionsByProjectId(client, projectId);
    expect(captured.selectColumns).not.toMatch(/token/i);
  });

  it("returns an empty array for a project with no submissions", async () => {
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeListClient({ data: [], captured });
    const result = await supabaseIntakeStaffGateway.listIntakeSubmissionsByProjectId(
      client,
      projectId,
    );
    expect(result).toEqual([]);
  });

  it("throws a generic error on a malformed payload snapshot, never leaking raw content", async () => {
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeListClient({
      data: [{ ...validRow, payload: { onlyOneField: "leaked-secret-content" } }],
      captured,
    });
    const error = await supabaseIntakeStaffGateway
      .listIntakeSubmissionsByProjectId(client, projectId)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("leaked-secret-content");
  });
});

describe("Task 027 Phase 2 Independent Review Patch 1, Finding C — exact 20-key payload snapshot validation", () => {
  it("accepts a valid exact-20-key snapshot", async () => {
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeDetailClient({ maybeSingleResult: { data: validRow }, captured });
    const result = await supabaseIntakeStaffGateway.getIntakeSubmissionById(
      client,
      projectId,
      submissionId,
    );
    expect(result?.weddingDetails).toEqual(validPayload);
  });

  it("throws a generic error when a required key is missing", async () => {
    const incompletePayload: Record<string, unknown> = { ...validPayload };
    delete incompletePayload.groomName;
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeDetailClient({
      maybeSingleResult: { data: { ...validRow, payload: incompletePayload } },
      captured,
    });
    await expect(
      supabaseIntakeStaffGateway.getIntakeSubmissionById(client, projectId, submissionId),
    ).rejects.toThrow();
  });

  it("throws a generic error when an extra/unknown key is present, even alongside all 20 valid keys", async () => {
    const extraKeyPayload = { ...validPayload, unexpected: "attacker-injected-value" };
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeDetailClient({
      maybeSingleResult: { data: { ...validRow, payload: extraKeyPayload } },
      captured,
    });
    const error = await supabaseIntakeStaffGateway
      .getIntakeSubmissionById(client, projectId, submissionId)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("unexpected");
    expect((error as Error).message).not.toContain("attacker-injected-value");
  });

  it("throws a generic error when a text field has the wrong type", async () => {
    const wrongTypePayload = { ...validPayload, invitationMessage: 12345 };
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeDetailClient({
      maybeSingleResult: { data: { ...validRow, payload: wrongTypePayload } },
      captured,
    });
    await expect(
      supabaseIntakeStaffGateway.getIntakeSubmissionById(client, projectId, submissionId),
    ).rejects.toThrow();
  });

  it("throws a generic error when a UUID field has the wrong type/shape", async () => {
    const wrongTypePayload = { ...validPayload, groomBankQrMediaId: "not-a-uuid" };
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeDetailClient({
      maybeSingleResult: { data: { ...validRow, payload: wrongTypePayload } },
      captured,
    });
    await expect(
      supabaseIntakeStaffGateway.getIntakeSubmissionById(client, projectId, submissionId),
    ).rejects.toThrow();
  });

  it("never mutates the original payload object while validating it", async () => {
    const originalPayload = { ...validPayload };
    const frozenPayload = Object.freeze({ ...validPayload });
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeDetailClient({
      maybeSingleResult: { data: { ...validRow, payload: frozenPayload } },
      captured,
    });
    await supabaseIntakeStaffGateway.getIntakeSubmissionById(client, projectId, submissionId);
    expect(frozenPayload).toEqual(originalPayload);
  });
});

describe("supabaseIntakeStaffGateway.getIntakeSubmissionById", () => {
  it("queries by exact submission id AND project id", async () => {
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeDetailClient({ maybeSingleResult: { data: validRow }, captured });

    const result = await supabaseIntakeStaffGateway.getIntakeSubmissionById(
      client,
      projectId,
      submissionId,
    );

    expect(captured.table).toBe("intake_submissions");
    expect(captured.eqCalls).toEqual([
      { column: "id", value: submissionId },
      { column: "project_id", value: projectId },
    ]);
    expect(result?.id).toBe(submissionId);
    expect(result?.weddingDetails).toEqual(validPayload);
  });

  it("returns null when not found", async () => {
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeDetailClient({ maybeSingleResult: { data: null }, captured });
    const result = await supabaseIntakeStaffGateway.getIntakeSubmissionById(
      client,
      projectId,
      submissionId,
    );
    expect(result).toBeNull();
  });

  it("never exposes token/token_hash/token_hint on the mapped record", async () => {
    const captured: Captured = { eqCalls: [], orderCalls: [] };
    const client = fakeDetailClient({ maybeSingleResult: { data: validRow }, captured });
    const result = await supabaseIntakeStaffGateway.getIntakeSubmissionById(
      client,
      projectId,
      submissionId,
    );
    expect(JSON.stringify(result)).not.toMatch(/token/i);
  });
});

describe("supabaseIntakeStaffGateway.applyIntakeSubmission", () => {
  const applyRow = {
    id: submissionId,
    project_id: projectId,
    status: "APPLIED",
    reviewed_by: staffId,
    reviewed_at: "2026-09-19T00:00:00.000Z",
    wedding_details_changed: true,
  };

  it("calls apply_intake_submission with exactly the project id and submission id", async () => {
    let capturedFn: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const client = fakeRpcClient({
      data: [applyRow],
      captureCall: (fn, params) => {
        capturedFn = fn;
        capturedParams = params;
      },
    });

    const result = await supabaseIntakeStaffGateway.applyIntakeSubmission(
      client,
      projectId,
      submissionId,
    );

    expect(capturedFn).toBe("apply_intake_submission");
    expect(capturedParams).toEqual({ p_project_id: projectId, p_submission_id: submissionId });
    expect(result).toEqual({
      id: submissionId,
      projectId,
      status: "APPLIED",
      reviewedBy: staffId,
      reviewedAt: "2026-09-19T00:00:00.000Z",
      weddingDetailsChanged: true,
    });
  });

  it.each([
    ["IS001", "FORBIDDEN"],
    ["IS003", "NOT_FOUND"],
    ["IS007", "NOT_FOUND"],
    ["IS008", "CONFLICT"],
  ])("maps ISxxx code %s to ApiError kind %s", async (code, kind) => {
    const client = fakeRpcClient({ error: { code, message: "raw postgres detail" } });
    const error = await supabaseIntakeStaffGateway
      .applyIntakeSubmission(client, projectId, submissionId)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
    expect((error as ApiError).message).not.toContain("raw postgres detail");
  });

  it("maps propagated WD004 to ApiError kind INVARIANT (422)", async () => {
    const client = fakeRpcClient({ error: { code: "WD004", message: "raw fk detail" } });
    const error = await supabaseIntakeStaffGateway
      .applyIntakeSubmission(client, projectId, submissionId)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INVARIANT");
    expect((error as ApiError).message).not.toContain("raw fk detail");
  });

  it("maps an unrecognized SQLSTATE to a generic INTERNAL failure", async () => {
    const client = fakeRpcClient({ error: { code: "99999", message: "raw postgres detail" } });
    const error = await supabaseIntakeStaffGateway
      .applyIntakeSubmission(client, projectId, submissionId)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("throws a generic error when the returned row belongs to a different submission", async () => {
    const client = fakeRpcClient({
      data: [{ ...applyRow, id: "99999999-9999-9999-9999-999999999999" }],
    });
    await expect(
      supabaseIntakeStaffGateway.applyIntakeSubmission(client, projectId, submissionId),
    ).rejects.toThrow();
  });

  it("throws a generic error when the returned row belongs to a different project", async () => {
    const client = fakeRpcClient({
      data: [{ ...applyRow, project_id: "99999999-9999-9999-9999-999999999999" }],
    });
    await expect(
      supabaseIntakeStaffGateway.applyIntakeSubmission(client, projectId, submissionId),
    ).rejects.toThrow();
  });

  it.each(["PENDING", "REJECTED"])(
    "throws a generic error when the returned status is %s instead of the literal APPLIED (Finding B)",
    async (status) => {
      const client = fakeRpcClient({ data: [{ ...applyRow, status }] });
      await expect(
        supabaseIntakeStaffGateway.applyIntakeSubmission(client, projectId, submissionId),
      ).rejects.toThrow();
    },
  );

  it("throws a generic error when zero rows are returned (Finding B: exact-one-row enforcement)", async () => {
    const client = fakeRpcClient({ data: [] });
    await expect(
      supabaseIntakeStaffGateway.applyIntakeSubmission(client, projectId, submissionId),
    ).rejects.toThrow();
  });

  it("throws a generic error when two rows are returned (Finding B: exact-one-row enforcement)", async () => {
    const client = fakeRpcClient({ data: [applyRow, applyRow] });
    await expect(
      supabaseIntakeStaffGateway.applyIntakeSubmission(client, projectId, submissionId),
    ).rejects.toThrow();
  });

  it("throws a generic error when data is not an array at all", async () => {
    const client = fakeRpcClient({ data: applyRow });
    await expect(
      supabaseIntakeStaffGateway.applyIntakeSubmission(client, projectId, submissionId),
    ).rejects.toThrow();
  });
});

describe("supabaseIntakeStaffGateway.rejectIntakeSubmission", () => {
  const rejectRow = {
    id: submissionId,
    project_id: projectId,
    status: "REJECTED",
    reviewed_by: staffId,
    reviewed_at: "2026-09-19T00:00:00.000Z",
    staff_note: "Please resubmit",
  };

  it("calls reject_intake_submission with exactly project id, submission id, and staff note", async () => {
    let capturedFn: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const client = fakeRpcClient({
      data: [rejectRow],
      captureCall: (fn, params) => {
        capturedFn = fn;
        capturedParams = params;
      },
    });

    const result = await supabaseIntakeStaffGateway.rejectIntakeSubmission(
      client,
      projectId,
      submissionId,
      "Please resubmit",
    );

    expect(capturedFn).toBe("reject_intake_submission");
    expect(capturedParams).toEqual({
      p_project_id: projectId,
      p_submission_id: submissionId,
      p_staff_note: "Please resubmit",
    });
    expect(result).toEqual({
      id: submissionId,
      projectId,
      status: "REJECTED",
      reviewedBy: staffId,
      reviewedAt: "2026-09-19T00:00:00.000Z",
      staffNote: "Please resubmit",
    });
  });

  it.each([
    ["IS001", "FORBIDDEN"],
    ["IS003", "NOT_FOUND"],
    ["IS007", "NOT_FOUND"],
    ["IS008", "CONFLICT"],
  ])("maps ISxxx code %s to ApiError kind %s", async (code, kind) => {
    const client = fakeRpcClient({ error: { code, message: "raw postgres detail" } });
    const error = await supabaseIntakeStaffGateway
      .rejectIntakeSubmission(client, projectId, submissionId, null)
      .catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
  });

  it("never maps WD004 (reject never composes with save_wedding_details)", async () => {
    const client = fakeRpcClient({ error: { code: "WD004", message: "unexpected" } });
    const error = await supabaseIntakeStaffGateway
      .rejectIntakeSubmission(client, projectId, submissionId, null)
      .catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it("throws a generic error when the returned row belongs to a different submission", async () => {
    const client = fakeRpcClient({
      data: [{ ...rejectRow, id: "99999999-9999-9999-9999-999999999999" }],
    });
    await expect(
      supabaseIntakeStaffGateway.rejectIntakeSubmission(client, projectId, submissionId, null),
    ).rejects.toThrow();
  });

  it("throws a generic error when the returned row belongs to a different project", async () => {
    const client = fakeRpcClient({
      data: [{ ...rejectRow, project_id: "99999999-9999-9999-9999-999999999999" }],
    });
    await expect(
      supabaseIntakeStaffGateway.rejectIntakeSubmission(client, projectId, submissionId, null),
    ).rejects.toThrow();
  });

  it.each(["PENDING", "APPLIED"])(
    "throws a generic error when the returned status is %s instead of the literal REJECTED (Finding B)",
    async (status) => {
      const client = fakeRpcClient({ data: [{ ...rejectRow, status }] });
      await expect(
        supabaseIntakeStaffGateway.rejectIntakeSubmission(client, projectId, submissionId, null),
      ).rejects.toThrow();
    },
  );

  it("throws a generic error when zero rows are returned (Finding B: exact-one-row enforcement)", async () => {
    const client = fakeRpcClient({ data: [] });
    await expect(
      supabaseIntakeStaffGateway.rejectIntakeSubmission(client, projectId, submissionId, null),
    ).rejects.toThrow();
  });

  it("throws a generic error when two rows are returned (Finding B: exact-one-row enforcement)", async () => {
    const client = fakeRpcClient({ data: [rejectRow, rejectRow] });
    await expect(
      supabaseIntakeStaffGateway.rejectIntakeSubmission(client, projectId, submissionId, null),
    ).rejects.toThrow();
  });

  it("throws a generic error when data is not an array at all", async () => {
    const client = fakeRpcClient({ data: rejectRow });
    await expect(
      supabaseIntakeStaffGateway.rejectIntakeSubmission(client, projectId, submissionId, null),
    ).rejects.toThrow();
  });
});
