import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { createProjectEvent } from "../create-project-event";
import type { ProjectEventsGateway } from "../project-events-gateway";
import type {
  CreateProjectEventResult,
  ProjectEventInput,
  ProjectEventRecord,
} from "../project-events-types";

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

const validBody = {
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

function fakeRecord(input: ProjectEventInput): ProjectEventRecord {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    projectId,
    ...input,
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
  };
}

function unusedGatewayMethods(): Pick<
  ProjectEventsGateway<FakeClient>,
  "projectExists" | "listProjectEvents" | "updateProjectEvent" | "deleteProjectEvent"
> {
  return {
    async projectExists() {
      throw new Error("should not be called");
    },
    async listProjectEvents() {
      throw new Error("should not be called");
    },
    async updateProjectEvent() {
      throw new Error("should not be called");
    },
    async deleteProjectEvent() {
      throw new Error("should not be called");
    },
  };
}

describe("createProjectEvent", () => {
  it("validates the body, then calls the gateway with the project id and parsed input", async () => {
    let received: { projectId: string; input: ProjectEventInput } | undefined;

    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async createProjectEvent(_client, pid, input) {
        received = { projectId: pid, input };
        const result: CreateProjectEventResult = { event: fakeRecord(input) };
        return result;
      },
    };

    const result = await createProjectEvent(projectId, validBody, staff, gateway);

    expect(received?.projectId).toBe(projectId);
    expect(received?.input).toEqual(validBody);
    expect(result.event.title).toBe("Lễ Vu Quy");
  });

  it("rejects a malformed project id as BAD_REQUEST without validating the body or calling the gateway", async () => {
    let called = false;
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async createProjectEvent() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await createProjectEvent("not-a-uuid", validBody, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a malformed body as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async createProjectEvent() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await createProjectEvent(
      projectId,
      { ...validBody, occasionType: "BIRTHDAY" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("propagates a NOT_FOUND ApiError raised by the gateway (e.g. project deleted mid-request)", async () => {
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async createProjectEvent() {
        throw new ApiError("NOT_FOUND", "Project not found");
      },
    };

    const error = await createProjectEvent(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("propagates an INVARIANT ApiError raised by the gateway (e.g. is_primary conflict)", async () => {
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async createProjectEvent() {
        throw new ApiError(
          "INVARIANT",
          "Another event is already marked primary for this Project/side",
        );
      },
    };

    const error = await createProjectEvent(projectId, validBody, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("INVARIANT");
  });
});
