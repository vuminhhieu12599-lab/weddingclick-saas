import { describe, expect, it } from "vitest";

import type { StaffContext } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectEventsGateway } from "../project-events-gateway";
import type { ProjectEventRecord } from "../project-events-types";
import { listProjectEventsByProjectId } from "../list-project-events";

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

const existingEvent: ProjectEventRecord = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  projectId,
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
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
};

function createFakeGateway(options: {
  projectExists: boolean;
  events: ProjectEventRecord[];
}): ProjectEventsGateway<FakeClient> {
  return {
    async projectExists() {
      return options.projectExists;
    },
    async listProjectEvents() {
      return options.events;
    },
    async createProjectEvent() {
      throw new Error("createProjectEvent should not be called in this test");
    },
    async updateProjectEvent() {
      throw new Error("updateProjectEvent should not be called in this test");
    },
    async deleteProjectEvent() {
      throw new Error("deleteProjectEvent should not be called in this test");
    },
  };
}

describe("listProjectEventsByProjectId", () => {
  it("returns events when the project exists and has events", async () => {
    const gateway = createFakeGateway({ projectExists: true, events: [existingEvent] });

    const result = await listProjectEventsByProjectId(projectId, staff, gateway);

    expect(result).toEqual([existingEvent]);
  });

  it("returns an empty array when the project exists but has no events", async () => {
    const gateway = createFakeGateway({ projectExists: true, events: [] });

    const result = await listProjectEventsByProjectId(projectId, staff, gateway);

    expect(result).toEqual([]);
  });

  it("throws NOT_FOUND when the project does not exist", async () => {
    const gateway = createFakeGateway({ projectExists: false, events: [] });

    const error = await listProjectEventsByProjectId(projectId, staff, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("rejects a malformed project id as BAD_REQUEST without querying the gateway", async () => {
    let called = false;
    const gateway: ProjectEventsGateway<FakeClient> = {
      async projectExists() {
        called = true;
        return true;
      },
      async listProjectEvents() {
        return [];
      },
      async createProjectEvent() {
        throw new Error("should not be called");
      },
      async updateProjectEvent() {
        throw new Error("should not be called");
      },
      async deleteProjectEvent() {
        throw new Error("should not be called");
      },
    };

    const error = await listProjectEventsByProjectId("not-a-uuid", staff, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });
});
