import { describe, expect, it } from "vitest";

import type { ServiceAddonCode } from "../../../domain";
import { ApiError } from "../../errors/api-error";
import type { ProjectGateway } from "../project-gateway";
import { resolveAddonsForCreation } from "../resolve-addons";

interface FakeClient {
  marker: string;
}

interface FakeAddon {
  id: string;
  code: ServiceAddonCode;
  name: string;
  priceVnd: number;
  isActive: boolean;
}

function createFakeGateway(addons: FakeAddon[]): ProjectGateway<FakeClient> {
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
    async getAddonsByCodes(_client, codes) {
      return addons.filter((a) => codes.includes(a.code));
    },
    async getActiveStaffProfileById() {
      return null;
    },
  };
  return gateway;
}

const client: FakeClient = { marker: "fake" };
const activeAddon: FakeAddon = {
  id: "addon-1",
  code: "PERSONALIZED_GUEST",
  name: "Personalized Guest Names",
  priceVnd: 50000,
  isActive: true,
};

describe("resolveAddonsForCreation", () => {
  it("returns an empty list for no add-ons requested", async () => {
    const gateway = createFakeGateway([activeAddon]);

    const result = await resolveAddonsForCreation([], client, gateway);

    expect(result).toEqual([]);
  });

  it("accepts a canonical, active add-on and returns the DB-derived price", async () => {
    const gateway = createFakeGateway([activeAddon]);

    const result = await resolveAddonsForCreation(["PERSONALIZED_GUEST"], client, gateway);

    expect(result).toEqual([activeAddon]);
  });

  it("rejects a duplicate add-on code with a clean validation error (chosen behavior: reject, not silently dedup)", async () => {
    const gateway = createFakeGateway([activeAddon]);

    const error = await resolveAddonsForCreation(
      ["PERSONALIZED_GUEST", "PERSONALIZED_GUEST"],
      client,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects an add-on code outside the canonical domain vocabulary", async () => {
    const gateway = createFakeGateway([activeAddon]);

    const error = await resolveAddonsForCreation(["NOT_A_REAL_ADDON"], client, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
  });

  it("rejects a canonical add-on code with no matching catalog row as NOT_FOUND", async () => {
    const gateway = createFakeGateway([]);

    const error = await resolveAddonsForCreation(["PERSONALIZED_GUEST"], client, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
  });

  it("rejects an inactive add-on as CONFLICT", async () => {
    const gateway = createFakeGateway([{ ...activeAddon, isActive: false }]);

    const error = await resolveAddonsForCreation(["PERSONALIZED_GUEST"], client, gateway).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("CONFLICT");
  });
});
