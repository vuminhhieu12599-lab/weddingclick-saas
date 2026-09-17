import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import { deleteProjectEvent } from "../delete-project-event";
import type { ProjectEventsGateway } from "../project-events-gateway";

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

function unusedGatewayMethods(): Pick<
  ProjectEventsGateway<FakeClient>,
  "projectExists" | "listProjectEvents" | "createProjectEvent" | "updateProjectEvent"
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
    async updateProjectEvent() {
      throw new Error("should not be called");
    },
  };
}

describe("deleteProjectEvent", () => {
  it("calls the gateway with the project id and event id", async () => {
    let received: { projectId: string; eventId: string } | undefined;

    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async deleteProjectEvent(_client, pid, eid) {
        received = { projectId: pid, eventId: eid };
      },
    };

    await deleteProjectEvent(projectId, eventId, staff, gateway);

    expect(received).toEqual({ projectId, eventId });
  });

  it("rejects a malformed project id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async deleteProjectEvent() {
        called = true;
      },
    };

    const error = await deleteProjectEvent("not-a-uuid", eventId, staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a malformed event id as BAD_REQUEST without calling the gateway", async () => {
    let called = false;
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async deleteProjectEvent() {
        called = true;
      },
    };

    const error = await deleteProjectEvent(projectId, "not-a-uuid", staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("propagates a NOT_FOUND ApiError raised by the gateway (event missing or belongs to another Project)", async () => {
    const gateway: ProjectEventsGateway<FakeClient> = {
      ...unusedGatewayMethods(),
      async deleteProjectEvent() {
        throw new ApiError("NOT_FOUND", "Event not found");
      },
    };

    const error = await deleteProjectEvent(projectId, eventId, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });
});
