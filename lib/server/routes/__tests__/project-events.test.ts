import { describe, expect, it } from "vitest";

import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type { ProjectEventsGateway } from "../../project-events/project-events-gateway";
import type {
  CreateProjectEventResult,
  ProjectEventInput,
  ProjectEventRecord,
  UpdateProjectEventResult,
} from "../../project-events/project-events-types";
import {
  handleCreateProjectEventRequest,
  handleDeleteProjectEventRequest,
  handleListProjectEventsRequest,
  handleUpdateProjectEventRequest,
} from "../project-events";

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
const existingEventId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const existingEvent: ProjectEventRecord = {
  id: existingEventId,
  projectId: existingProjectId,
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

const validCreateBody = {
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

function createFakeGateway(options?: {
  projectExists?: boolean;
  events?: ProjectEventRecord[];
  createProjectEvent?: ProjectEventsGateway<FakeClient>["createProjectEvent"];
  updateProjectEvent?: ProjectEventsGateway<FakeClient>["updateProjectEvent"];
  deleteProjectEvent?: ProjectEventsGateway<FakeClient>["deleteProjectEvent"];
}): ProjectEventsGateway<FakeClient> {
  return {
    async projectExists() {
      return options?.projectExists ?? true;
    },
    async listProjectEvents() {
      return options?.events ?? [];
    },
    async createProjectEvent(client, projectId, input) {
      if (options?.createProjectEvent) {
        return options.createProjectEvent(client, projectId, input);
      }
      const result: CreateProjectEventResult = {
        event: { ...existingEvent, ...input },
      };
      return result;
    },
    async updateProjectEvent(client, projectId, eventId, input) {
      if (options?.updateProjectEvent) {
        return options.updateProjectEvent(client, projectId, eventId, input);
      }
      const result: UpdateProjectEventResult = {
        event: { ...existingEvent, ...input },
        changed: true,
        operation: "UPDATED",
      };
      return result;
    },
    async deleteProjectEvent(client, projectId, eventId) {
      if (options?.deleteProjectEvent) {
        return options.deleteProjectEvent(client, projectId, eventId);
      }
    },
  };
}

describe("handleListProjectEventsRequest", () => {
  it("returns 200 with data when events exist", async () => {
    const result = await handleListProjectEventsRequest(
      "Bearer good-token",
      existingProjectId,
      activeStaffAuth,
      createFakeGateway({ projectExists: true, events: [existingEvent] }),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: [existingEvent] });
  });

  it("returns 200 with data: [] when the project exists but has no events", async () => {
    const result = await handleListProjectEventsRequest(
      "Bearer good-token",
      existingProjectId,
      activeStaffAuth,
      createFakeGateway({ projectExists: true, events: [] }),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: [] });
  });

  it("returns 404 when the project does not exist", async () => {
    const result = await handleListProjectEventsRequest(
      "Bearer good-token",
      existingProjectId,
      activeStaffAuth,
      createFakeGateway({ projectExists: false }),
    );

    expect(result.status).toBe(404);
  });

  it("returns 400 for a malformed project id", async () => {
    const result = await handleListProjectEventsRequest(
      "Bearer good-token",
      "not-a-uuid",
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleListProjectEventsRequest(
      null,
      existingProjectId,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleListProjectEventsRequest(
      "Bearer token",
      existingProjectId,
      noProfileAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
  });
});

describe("handleCreateProjectEventRequest", () => {
  it("returns 201 with the created event", async () => {
    const result = await handleCreateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      validCreateBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(201);
    expect((result.body as CreateProjectEventResult).event.title).toBe("Lễ Vu Quy");
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleCreateProjectEventRequest(
      null,
      existingProjectId,
      validCreateBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleCreateProjectEventRequest(
      "Bearer token",
      existingProjectId,
      validCreateBody,
      noProfileAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed request body without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway({
      createProjectEvent: async () => {
        called = true;
        throw new Error("should not be called");
      },
    });

    const result = await handleCreateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      { ...validCreateBody, occasionType: "BIRTHDAY" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });

  it("returns 400 for a forbidden server-owned field without calling the gateway", async () => {
    let called = false;
    const gateway = createFakeGateway({
      createProjectEvent: async () => {
        called = true;
        throw new Error("should not be called");
      },
    });

    const result = await handleCreateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      { ...validCreateBody, projectId: "attacker-supplied" },
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(400);
    expect(called).toBe(false);
  });

  it("returns 404 when the RPC reports the Project does not exist", async () => {
    const gateway = createFakeGateway({
      createProjectEvent: async () => {
        throw new ApiError("NOT_FOUND", "Project not found");
      },
    });

    const result = await handleCreateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      validCreateBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Project not found" });
  });

  it("returns 422 when the RPC reports an is_primary INVARIANT violation", async () => {
    const gateway = createFakeGateway({
      createProjectEvent: async () => {
        throw new ApiError(
          "INVARIANT",
          "Another event is already marked primary for this Project/side",
        );
      },
    });

    const result = await handleCreateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      validCreateBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(422);
  });

  it("maps an unexpected gateway failure to a generic 500 without leaking details", async () => {
    const gateway = createFakeGateway({
      createProjectEvent: async () => {
        throw new Error('relation "public.project_events" internal constraint detail');
      },
    });

    const result = await handleCreateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      validCreateBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });
});

describe("handleUpdateProjectEventRequest", () => {
  it("returns 200 with the updated event", async () => {
    const result = await handleUpdateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      existingEventId,
      validCreateBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(200);
    expect((result.body as UpdateProjectEventResult).changed).toBe(true);
    expect((result.body as UpdateProjectEventResult).operation).toBe("UPDATED");
  });

  it("returns 200 with changed=false for a no-op update", async () => {
    const gateway = createFakeGateway({
      updateProjectEvent: async (_client, _pid, _eid, input: ProjectEventInput) => ({
        event: { ...existingEvent, ...input },
        changed: false,
        operation: null,
      }),
    });

    const result = await handleUpdateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      existingEventId,
      validCreateBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(200);
    expect((result.body as UpdateProjectEventResult).changed).toBe(false);
    expect((result.body as UpdateProjectEventResult).operation).toBeNull();
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleUpdateProjectEventRequest(
      null,
      existingProjectId,
      existingEventId,
      validCreateBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleUpdateProjectEventRequest(
      "Bearer token",
      existingProjectId,
      existingEventId,
      validCreateBody,
      noProfileAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
  });

  it("returns 400 for a malformed event id", async () => {
    const result = await handleUpdateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      "not-a-uuid",
      validCreateBody,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(400);
  });

  it("returns 404 when the event does not exist for this Project", async () => {
    const gateway = createFakeGateway({
      updateProjectEvent: async () => {
        throw new ApiError("NOT_FOUND", "Event not found");
      },
    });

    const result = await handleUpdateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      existingEventId,
      validCreateBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Event not found" });
  });

  it("returns 404 when the event belongs to a different Project (same code as not-found — anti-enumeration)", async () => {
    const gateway = createFakeGateway({
      updateProjectEvent: async () => {
        throw new ApiError("NOT_FOUND", "Event not found");
      },
    });

    const result = await handleUpdateProjectEventRequest(
      "Bearer good-token",
      "22222222-2222-2222-2222-222222222222",
      existingEventId,
      validCreateBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Event not found" });
  });

  it("maps an unexpected gateway failure to a generic 500 without leaking details", async () => {
    const gateway = createFakeGateway({
      updateProjectEvent: async () => {
        throw new Error('relation "public.project_events" internal constraint detail');
      },
    });

    const result = await handleUpdateProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      existingEventId,
      validCreateBody,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });
});

describe("handleDeleteProjectEventRequest", () => {
  it("returns 200 with deleted: true on success", async () => {
    const result = await handleDeleteProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      existingEventId,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ deleted: true });
  });

  it("returns 401 without an Authorization header", async () => {
    const result = await handleDeleteProjectEventRequest(
      null,
      existingProjectId,
      existingEventId,
      activeStaffAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(401);
  });

  it("returns 403 for an authenticated non-staff user", async () => {
    const noProfileAuth = createFakeAuthGateway({ userId: "user-1", profile: null });

    const result = await handleDeleteProjectEventRequest(
      "Bearer token",
      existingProjectId,
      existingEventId,
      noProfileAuth,
      createFakeGateway(),
    );

    expect(result.status).toBe(403);
  });

  it("returns 404 when the event does not exist for this Project", async () => {
    const gateway = createFakeGateway({
      deleteProjectEvent: async () => {
        throw new ApiError("NOT_FOUND", "Event not found");
      },
    });

    const result = await handleDeleteProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      existingEventId,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "Event not found" });
  });

  it("maps an unexpected gateway failure to a generic 500 without leaking details", async () => {
    const gateway = createFakeGateway({
      deleteProjectEvent: async () => {
        throw new Error('relation "public.project_events" internal constraint detail');
      },
    });

    const result = await handleDeleteProjectEventRequest(
      "Bearer good-token",
      existingProjectId,
      existingEventId,
      activeStaffAuth,
      gateway,
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
  });
});
