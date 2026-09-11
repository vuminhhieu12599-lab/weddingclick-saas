import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import type { ProjectGateway } from "../project-gateway";
import { resolveAssignedStaffForCreation } from "../resolve-assigned-staff";

interface FakeClient {
  marker: string;
}

function createFakeGateway(
  profile: { id: string; displayName: string; isActive: boolean } | null,
): ProjectGateway<FakeClient> {
  const gateway: ProjectGateway<FakeClient> = {
    async getProjectById() {
      return null;
    },
    async listProjects() {
      return [];
    },
    async getPackageByCode() {
      return null;
    },
    async getAddonsByCodes() {
      return [];
    },
    async getActiveStaffProfileById(_client, id) {
      return profile && profile.id === id ? profile : null;
    },
    async createProject() {
      throw new Error("createProject should not be called in this test");
    },
  };
  return gateway;
}

const client: FakeClient = { marker: "fake" };
const activeStaff = { id: "11111111-1111-1111-1111-111111111111", displayName: "Staff One", isActive: true };

describe("resolveAssignedStaffForCreation", () => {
  it("allows no assigned staff (null)", async () => {
    const gateway = createFakeGateway(null);

    const result = await resolveAssignedStaffForCreation(null, client, gateway);

    expect(result).toBeNull();
  });

  it("resolves a valid, active staff id", async () => {
    const gateway = createFakeGateway(activeStaff);

    const result = await resolveAssignedStaffForCreation(activeStaff.id, client, gateway);

    expect(result).toEqual(activeStaff);
  });

  it("rejects a malformed UUID without querying the gateway", async () => {
    let called = false;
    const gateway: ProjectGateway<FakeClient> = {
      async getProjectById() {
        return null;
      },
      async listProjects() {
        return [];
      },
      async getPackageByCode() {
        return null;
      },
      async getAddonsByCodes() {
        return [];
      },
      async getActiveStaffProfileById() {
        called = true;
        return null;
      },
      async createProject() {
        throw new Error("createProject should not be called in this test");
      },
    };

    const error = await resolveAssignedStaffForCreation("not-a-uuid", client, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("rejects a well-formed UUID that does not resolve to an active staff profile", async () => {
    // Covers both "no such profile" and "profile exists but inactive" —
    // the gateway's own is_active filter collapses both to null, and this
    // function must never trust an arbitrary auth.users UUID either way.
    const gateway = createFakeGateway(null);

    const error = await resolveAssignedStaffForCreation(
      "22222222-2222-2222-2222-222222222222",
      client,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });
});
