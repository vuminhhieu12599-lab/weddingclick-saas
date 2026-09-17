import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { ApiError, apiErrorStatus } from "../../errors/api-error";
import type { ProjectEventInput } from "../../project-events/project-events-types";
import { supabaseProjectEventsGateway } from "../project-events-repository";

const validInput: ProjectEventInput = {
  occasionType: "VU_QUY",
  side: "BRIDE",
  title: "Lễ Vu Quy",
  startsAt: "2027-02-14T01:00:00.000Z",
  timezone: "Asia/Ho_Chi_Minh",
  venueName: null,
  address: null,
  mapUrl: null,
  description: null,
  sortOrder: 0,
  isPrimary: true,
};

const projectId = "11111111-1111-1111-1111-111111111111";
const eventId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const successRow = {
  id: eventId,
  project_id: projectId,
  occasion_type: validInput.occasionType,
  side: validInput.side,
  title: validInput.title,
  starts_at: validInput.startsAt,
  timezone: validInput.timezone,
  venue_name: null,
  address: null,
  map_url: null,
  description: null,
  sort_order: validInput.sortOrder,
  is_primary: validInput.isPrimary,
  created_at: "2026-09-12T00:00:00.000Z",
  updated_at: "2026-09-12T00:00:00.000Z",
};

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

describe("supabaseProjectEventsGateway.createProjectEvent", () => {
  it("calls create_project_event with snake_case p_-prefixed params derived from the camelCase input", async () => {
    let captured: { fn: string; params: Record<string, unknown> } | undefined;
    const client = fakeClientWithRpcResult({
      data: [successRow],
      captureCall: (fn, params) => {
        captured = { fn, params: params as Record<string, unknown> };
      },
    });

    await supabaseProjectEventsGateway.createProjectEvent(client, projectId, validInput);

    expect(captured?.fn).toBe("create_project_event");
    expect(captured?.params).toEqual({
      p_project_id: projectId,
      p_occasion_type: validInput.occasionType,
      p_side: validInput.side,
      p_title: validInput.title,
      p_starts_at: validInput.startsAt,
      p_timezone: validInput.timezone,
      p_venue_name: null,
      p_address: null,
      p_map_url: null,
      p_description: null,
      p_sort_order: validInput.sortOrder,
      p_is_primary: validInput.isPrimary,
    });
  });

  it("maps the RPC row to a CreateProjectEventResult", async () => {
    const client = fakeClientWithRpcResult({ data: [successRow] });

    const result = await supabaseProjectEventsGateway.createProjectEvent(
      client,
      projectId,
      validInput,
    );

    expect(result.event).toEqual({
      id: eventId,
      projectId,
      occasionType: "VU_QUY",
      side: "BRIDE",
      title: "Lễ Vu Quy",
      startsAt: successRow.starts_at,
      timezone: "Asia/Ho_Chi_Minh",
      venueName: null,
      address: null,
      mapUrl: null,
      description: null,
      sortOrder: 0,
      isPrimary: true,
      createdAt: successRow.created_at,
      updatedAt: successRow.updated_at,
    });
  });

  it.each([
    ["PE001", "FORBIDDEN", "Active WeddingClick staff role required"],
    ["PE002", "NOT_FOUND", "Project not found"],
    ["PE003", "INVARIANT", "Target Project is not a WEDDING project"],
    [
      "PE005",
      "INVARIANT",
      "Another event is already marked primary for this Project/side",
    ],
  ])("maps known RPC error code %s to ApiError(%s)", async (code, kind, message) => {
    const client = fakeClientWithRpcResult({
      error: { code, message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectEventsGateway
      .createProjectEvent(client, projectId, validInput)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
    expect((error as ApiError).message).toBe(message);
    expect((error as ApiError).message).not.toContain("raw postgres detail");
  });

  it("maps an unrecognized SQLSTATE to a generic error without leaking the raw message", async () => {
    const client = fakeClientWithRpcResult({
      error: { code: "23503", message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectEventsGateway
      .createProjectEvent(client, projectId, validInput)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("raw postgres detail");
  });

  it("treats an unexpected response shape (no error, empty row array) as a generic failure", async () => {
    const client = fakeClientWithRpcResult({ data: [], error: null });

    const error = await supabaseProjectEventsGateway
      .createProjectEvent(client, projectId, validInput)
      .catch((e) => e);

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("supabaseProjectEventsGateway.updateProjectEvent", () => {
  it("calls update_project_event with the project id, event id, and snake_case params", async () => {
    let captured: { fn: string; params: Record<string, unknown> } | undefined;
    const client = fakeClientWithRpcResult({
      data: [{ ...successRow, changed: true, operation: "UPDATED" }],
      captureCall: (fn, params) => {
        captured = { fn, params: params as Record<string, unknown> };
      },
    });

    await supabaseProjectEventsGateway.updateProjectEvent(
      client,
      projectId,
      eventId,
      validInput,
    );

    expect(captured?.fn).toBe("update_project_event");
    expect(captured?.params).toMatchObject({
      p_project_id: projectId,
      p_event_id: eventId,
    });
  });

  it("maps changed=false / operation=null through unchanged", async () => {
    const client = fakeClientWithRpcResult({
      data: [{ ...successRow, changed: false, operation: null }],
    });

    const result = await supabaseProjectEventsGateway.updateProjectEvent(
      client,
      projectId,
      eventId,
      validInput,
    );

    expect(result.changed).toBe(false);
    expect(result.operation).toBeNull();
  });

  it.each([
    ["PE004", "NOT_FOUND", 404],
    ["PE005", "INVARIANT", 422],
  ])("maps known RPC error code %s to ApiError(%s) -> HTTP %d", async (code, kind, status) => {
    const client = fakeClientWithRpcResult({
      error: { code, message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectEventsGateway
      .updateProjectEvent(client, projectId, eventId, validInput)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe(kind);
    expect(apiErrorStatus((error as ApiError).kind)).toBe(status);
  });
});

describe("supabaseProjectEventsGateway.deleteProjectEvent", () => {
  it("calls delete_project_event with the project id and event id", async () => {
    let captured: { fn: string; params: Record<string, unknown> } | undefined;
    const client = fakeClientWithRpcResult({
      data: null,
      captureCall: (fn, params) => {
        captured = { fn, params: params as Record<string, unknown> };
      },
    });

    await supabaseProjectEventsGateway.deleteProjectEvent(client, projectId, eventId);

    expect(captured).toEqual({
      fn: "delete_project_event",
      params: { p_project_id: projectId, p_event_id: eventId },
    });
  });

  it("maps PE004 (event not found / wrong Project) to ApiError NOT_FOUND", async () => {
    const client = fakeClientWithRpcResult({
      error: { code: "PE004", message: "raw postgres detail that must never leak" },
    });

    const error = await supabaseProjectEventsGateway
      .deleteProjectEvent(client, projectId, eventId)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
    expect((error as ApiError).message).not.toContain("raw postgres detail");
  });

  it("resolves without error on success", async () => {
    const client = fakeClientWithRpcResult({ data: null, error: null });

    await expect(
      supabaseProjectEventsGateway.deleteProjectEvent(client, projectId, eventId),
    ).resolves.toBeUndefined();
  });
});

describe("supabaseProjectEventsGateway.projectExists / listProjectEvents", () => {
  function fakeClientWithFromResult(options: {
    projectData?: unknown;
    projectError?: { message: string } | null;
    eventsData?: unknown;
    eventsError?: { message: string } | null;
  }): SupabaseClient {
    return {
      from: (table: string) => {
        if (table === "projects") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: options.projectData ?? null,
                  error: options.projectError ?? null,
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: async () => ({
                  data: options.eventsData ?? [],
                  error: options.eventsError ?? null,
                }),
              }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;
  }

  it("projectExists returns true when a row is found", async () => {
    const client = fakeClientWithFromResult({ projectData: { id: projectId } });
    expect(await supabaseProjectEventsGateway.projectExists(client, projectId)).toBe(true);
  });

  it("projectExists returns false when no row is found", async () => {
    const client = fakeClientWithFromResult({ projectData: null });
    expect(await supabaseProjectEventsGateway.projectExists(client, projectId)).toBe(false);
  });

  it("listProjectEvents maps rows to ProjectEventRecord[]", async () => {
    const client = fakeClientWithFromResult({ eventsData: [successRow] });
    const result = await supabaseProjectEventsGateway.listProjectEvents(client, projectId);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(eventId);
    expect(result[0]?.title).toBe(successRow.title);
  });

  it("listProjectEvents returns an empty array when no events exist", async () => {
    const client = fakeClientWithFromResult({ eventsData: [] });
    const result = await supabaseProjectEventsGateway.listProjectEvents(client, projectId);

    expect(result).toEqual([]);
  });
});
