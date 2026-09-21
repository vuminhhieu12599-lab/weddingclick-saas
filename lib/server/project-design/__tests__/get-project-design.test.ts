import { describe, expect, it } from "vitest";

import { ApiError } from "../../errors/api-error";
import { getProjectDesignByProjectId } from "../get-project-design";
import type { ProjectDesignGateway } from "../project-design-gateway";
import type { ProjectDesignRecord } from "../project-design-types";

interface FakeClient {
  marker: string;
}

const staff = { userId: "staff-1", role: "STAFF" as const, displayName: "Test Staff", supabase: { marker: "x" } as FakeClient };

const existingProjectId = "11111111-1111-1111-1111-111111111111";

const existingRecord: ProjectDesignRecord = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  projectId: existingProjectId,
  templateVersionId: "22222222-2222-2222-2222-222222222222",
  paletteKey: "ivory-champagne",
  fontPresetKey: "editorial-classic",
  effectPresetKey: "NONE",
  sectionSettings: {},
  designSettings: {},
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
};

function createFakeGateway(options?: {
  projectExists?: boolean;
  design?: ProjectDesignRecord | null;
}): ProjectDesignGateway<FakeClient> {
  return {
    async getProjectForDesign() {
      return options?.projectExists === false
        ? null
        : { id: existingProjectId, eventType: "WEDDING" };
    },
    async getCurrentProjectDesign() {
      return options?.design ?? null;
    },
    async getTemplateVersionForDesign() {
      throw new Error("not used by GET");
    },
    async getTemplateForDesign() {
      throw new Error("not used by GET");
    },
    async upsertProjectDesign() {
      throw new Error("not used by GET");
    },
  };
}

describe("getProjectDesignByProjectId", () => {
  it("rejects a malformed project id", async () => {
    await expect(
      getProjectDesignByProjectId("not-a-uuid", staff, createFakeGateway()),
    ).rejects.toThrow(ApiError);
  });

  it("throws NOT_FOUND when the Project does not exist", async () => {
    await expect(
      getProjectDesignByProjectId(
        existingProjectId,
        staff,
        createFakeGateway({ projectExists: false }),
      ),
    ).rejects.toMatchObject({ kind: "NOT_FOUND" });
  });

  it("returns null when the Project exists but has no design yet", async () => {
    const result = await getProjectDesignByProjectId(
      existingProjectId,
      staff,
      createFakeGateway({ projectExists: true, design: null }),
    );

    expect(result).toBeNull();
  });

  it("returns the design record when one exists", async () => {
    const result = await getProjectDesignByProjectId(
      existingProjectId,
      staff,
      createFakeGateway({ projectExists: true, design: existingRecord }),
    );

    expect(result).toEqual(existingRecord);
  });
});
