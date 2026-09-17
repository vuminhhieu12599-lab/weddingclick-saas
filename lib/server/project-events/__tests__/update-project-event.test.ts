import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectEventsGateway } from "../project-events-gateway";
import type {
  ProjectEventInput,
  ProjectEventRecord,
  UpdateProjectEventResult,
} from "../project-events-types";
import { updateProjectEvent } from "../update-project-event";

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
const eventId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const validBody = {
  occasionType: "THANH_HON",
  side: "GROOM",
  title: "Lễ Thành Hôn",
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
    id: eventId,
    projectId,
    ...input,
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
  };
}

function unusedGatewayMethods(): Pick<
  ProjectEventsGateway<FakeClient>,
  "projectExists" | "listProjectEvents" | "createProjectEvent" | "deleteProjectEvent"
> {
  return {
    async projectExists() {
      throw new Error("should not be called");
    },
    async listProjectEvents() {
      throw new Error("should not be called");
    },
    async createProjectEvent() {
      throw new Error("should not be called");
    },
    async deleteProjectEvent() {
      throw new Error("should not be called");
    },
  };
}

describe("updateProjectEvent", () => {
  it("validates the body, then calls the gateway with the project id, event id, and parsed input", async () => {
    let received:
      | { projectId: string; eventId: string; input: ProjectEventInput }
      | undefined;

    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async updateProjectEvent(_client, pid, eid, input) {
        received = { projectId: pid, eventId: eid, input };
        const result: UpdateProjectEventResult = {
          event: fakeRecord(input),
          changed: true,
          operation: "UPDATED",
        };
        return result;
      },
    };

    const result = await updateProjectEvent(projectId, eventId, validBody, staff, gateway);

    expect(received?.projectId).toBe(projectId);
    expect(received?.eventId).toBe(eventId);
    expect(received?.input).toEqual(validBody);
    expect(result.changed).toBe(true);
    expect(result.operation).toBe("UPDATED");
  });

  it("rejects a malformed project id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async updateProjectEvent() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await updateProjectEvent(
      "not-a-uuid",
      eventId,
      validBody,
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a malformed event id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async updateProjectEvent() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await updateProjectEvent(
      projectId,
      "not-a-uuid",
      validBody,
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a malformed body as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async updateProjectEvent() {
        called = true;
        throw new Error("should not be called");
      },
    };

    const error = await updateProjectEvent(
      projectId,
      eventId,
      { ...validBody, side: "GUEST" },
      staff,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("propagates a NOT_FOUND ApiError raised by the gateway (event missing or belongs to another Project)", async () => {
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async updateProjectEvent() {
        throw new ApiError("NOT_FOUND", "Event not found");
      },
    };

    const error = await updateProjectEvent(projectId, eventId, validBody, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("propagates changed=false with operation=null for a no-op update", async () => {
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async updateProjectEvent(_client, _pid, _eid, input) {
        return { event: fakeRecord(input), changed: false, operation: null };
      },
    };

    const result = await updateProjectEvent(projectId, eventId, validBody, staff, gateway);

    expect(result.changed).toBe(false);
    expect(result.operation).toBeNull();
  });
});
