import { describe, expect, it } from "vitest";

import type { ServicePackageCode } from "../../../domain";
import { ApiError } from "../../errors/api-error";
import type { ProjectGateway } from "../project-gateway";
import { resolvePackageForCreation } from "../resolve-package";

interface FakeClient {
  marker: string;
}

function createFakeGateway(
  packages: Record<
    string,
    { id: string; code: ServicePackageCode; name: string; priceVnd: number; isActive: boolean }
  >,
): ProjectGateway<FakeClient> {
  const gateway: ProjectGateway<FakeClient> = {
    async getProjectById() {
      return null;
    },
    async listProjects() {
      return [];
    },
    async getPackageByCode(_client, code) {
      return packages[code] ?? null;
    },
    async getAddonsByCodes() {
      return [];
    },
    async getActiveStaffProfileById() {
      return null;
    },
    async createProject() {
      throw new Error("createProject should not be called in this test");
    },
  };
  return gateway;
}

const client: FakeClient = { marker: "fake" };

describe("resolvePackageForCreation", () => {
  it("accepts a canonical, active package and returns the DB-derived price", async () => {
    const gateway = createFakeGateway({
      COMMON: { id: "pkg-1", code: "COMMON", name: "Common Invitation", priceVnd: 150000, isActive: true },
    });

    const result = await resolvePackageForCreation("COMMON", client, gateway);

    expect(result).toEqual({
      id: "pkg-1",
      code: "COMMON",
      name: "Common Invitation",
      priceVnd: 150000,
      isActive: true,
    });
  });

  it("rejects a package code outside the canonical domain vocabulary", async () => {
    const gateway = createFakeGateway({});

    await expect(resolvePackageForCreation("NOT_A_REAL_CODE", client, gateway)).rejects.toMatchObject(
      { kind: "BAD_REQUEST" },
    );
  });

  it("rejects a canonical code with no matching catalog row as NOT_FOUND", async () => {
    const gateway = createFakeGateway({});

    const error = await resolvePackageForCreation("SEPARATE", client, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("rejects an inactive package as CONFLICT", async () => {
    const gateway = createFakeGateway({
      SEPARATE: { id: "pkg-2", code: "SEPARATE", name: "Separate", priceVnd: 250000, isActive: false },
    });

    const error = await resolvePackageForCreation("SEPARATE", client, gateway).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
  });

  it("never returns a price other than the one from the catalog row", async () => {
    // Regression guard: nothing about this function's signature accepts a
    // client-supplied price at all, so there is no path for one to leak
    // through — this test documents that the returned priceVnd is always
    // exactly the catalog value.
    const gateway = createFakeGateway({
      COMMON: { id: "pkg-1", code: "COMMON", name: "Common Invitation", priceVnd: 150000, isActive: true },
    });

    const result = await resolvePackageForCreation("COMMON", client, gateway);

    expect(result.priceVnd).toBe(150000);
  });
});
