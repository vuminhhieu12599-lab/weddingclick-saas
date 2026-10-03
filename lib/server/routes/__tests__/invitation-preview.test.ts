import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationViewModel } from "../../../invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../invitation-rendering/renderer-selection";
import type { SnapshotPayloadV1 } from "../../../invitation-rendering/snapshot-payload-types";
import type { StaffAuthGateway } from "../../auth/staff-context";
import { ApiError } from "../../errors/api-error";
import type {
  StaffInvitationPreviewDependencies,
  StaffInvitationPreviewResult,
} from "../../invitation-preview/build-staff-invitation-preview";

/**
 * Staff preview HTTP handler: staff auth first, the frozen
 * `buildStaffInvitationPreview` use case unchanged, the backend error
 * model mapped without leaking detail, and no Snapshot in the body.
 */

const buildSpy = vi.fn<(...args: unknown[]) => Promise<StaffInvitationPreviewResult>>();

vi.mock("../../invitation-preview/build-staff-invitation-preview", async (importActual) => {
  const actual = await importActual<typeof import("../../invitation-preview/build-staff-invitation-preview")>();
  return { ...actual, buildStaffInvitationPreview: (...args: unknown[]) => buildSpy(...args) };
});

const { handleGetStaffInvitationPreviewRequest } = await import("../invitation-preview");
const actualBuilder = await vi.importActual<typeof import("../../invitation-preview/build-staff-invitation-preview")>(
  "../../invitation-preview/build-staff-invitation-preview",
);

interface FakeClient {
  marker: string;
}

function authGateway(profile: { role: string; displayName: string } | null): StaffAuthGateway<FakeClient> {
  return {
    createClient: (accessToken) => ({ marker: `client-for-${accessToken}` }),
    getAuthenticatedUserId: async () => "staff-1",
    getActiveStaffProfile: async () => profile,
  };
}

const staffAuth = authGateway({ role: "STAFF", displayName: "Test Staff" });
const nonStaffAuth = authGateway(null);
const deps = { marker: "deps" } as unknown as StaffInvitationPreviewDependencies<FakeClient>;
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const AUTH = "Bearer token-1";

const viewModel = { marker: "view-model" } as unknown as InvitationViewModel;
const sections = { marker: "sections" } as unknown as RendererEffectiveSections;
const snapshot = { marker: "snapshot" } as unknown as SnapshotPayloadV1;
const READY: StaffInvitationPreviewResult = {
  status: "READY",
  snapshot,
  viewModel,
  rendererKey: "wedding.any-backend-key.v7",
  sections,
};

beforeEach(() => {
  buildSpy.mockReset();
  buildSpy.mockResolvedValue(READY);
});

describe("handleGetStaffInvitationPreviewRequest — staff authentication", () => {
  it("rejects a missing Authorization header without building", async () => {
    const result = await handleGetStaffInvitationPreviewRequest(null, PROJECT_ID, null, staffAuth, deps);
    expect(result.status).toBe(401);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
    expect(buildSpy).not.toHaveBeenCalled();
  });

  it("rejects an authenticated non-staff caller without building", async () => {
    const result = await handleGetStaffInvitationPreviewRequest(AUTH, PROJECT_ID, null, nonStaffAuth, deps);
    expect(result.status).toBe(403);
    expect(buildSpy).not.toHaveBeenCalled();
  });

  it("passes the staff context's own JWT-scoped client and the injected deps to the frozen builder", async () => {
    const result = await handleGetStaffInvitationPreviewRequest(AUTH, PROJECT_ID, "COMMON", staffAuth, deps);
    expect(result.status).toBe(200);
    const [projectId, variant, staff, passedDeps] = buildSpy.mock.calls[0] ?? [];
    expect(projectId).toBe(PROJECT_ID);
    expect(variant).toBe("COMMON");
    expect((staff as { supabase: FakeClient }).supabase).toEqual({ marker: "client-for-token-1" });
    expect(passedDeps).toBe(deps);
  });
});

describe("handleGetStaffInvitationPreviewRequest — variant", () => {
  it("defaults to COMMON when no variant is supplied", async () => {
    await handleGetStaffInvitationPreviewRequest(AUTH, PROJECT_ID, null, staffAuth, deps);
    expect(buildSpy.mock.calls[0]?.[1]).toBe("COMMON");
  });

  it.each(["GROOM", "BRIDE"])("forwards %s unchanged", async (variant) => {
    await handleGetStaffInvitationPreviewRequest(AUTH, PROJECT_ID, variant, staffAuth, deps);
    expect(buildSpy.mock.calls[0]?.[1]).toBe(variant);
  });

  it.each(["groom", "", "PUBLIC", "COMMON;drop"])(
    "invalid variant %j → 400 from the real builder's validation, before any load",
    async (variant) => {
      buildSpy.mockImplementation((...args: unknown[]) =>
        actualBuilder.buildStaffInvitationPreview(
          args[0] as string,
          args[1] as string,
          args[2] as never,
          {} as StaffInvitationPreviewDependencies<FakeClient>,
        ),
      );
      const result = await handleGetStaffInvitationPreviewRequest(AUTH, PROJECT_ID, variant, staffAuth, deps);
      expect(result.status).toBe(400);
      expect(result.body).toEqual({ error: "Variant must be COMMON, GROOM or BRIDE" });
    },
  );
});

describe("handleGetStaffInvitationPreviewRequest — results", () => {
  it("READY returns exactly the renderer-host inputs with the backend renderer key, never the Snapshot", async () => {
    const result = await handleGetStaffInvitationPreviewRequest(AUTH, PROJECT_ID, "GROOM", staffAuth, deps);
    expect(result.status).toBe(200);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
    expect(result.body).toEqual({
      data: { status: "READY", rendererKey: "wedding.any-backend-key.v7", viewModel, sections },
    });
    expect(JSON.stringify(result.body)).not.toContain("snapshot");
  });

  it("BLOCKED returns the frozen builder issues unchanged with 200", async () => {
    const issues = [{ code: "GROOM_NAME_MISSING", severity: "BLOCKING", message: "Groom name is missing" }] as const;
    buildSpy.mockResolvedValue({ status: "BLOCKED", issues: [...issues] });
    const result = await handleGetStaffInvitationPreviewRequest(AUTH, PROJECT_ID, "BRIDE", staffAuth, deps);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ data: { status: "BLOCKED", issues } });
  });

  it.each([
    [new ApiError("CONFLICT", "Project design is not configured"), 409],
    [new ApiError("NOT_FOUND", "Project not found"), 404],
    [new ApiError("BAD_REQUEST", "Project id must be a valid UUID"), 400],
  ] as const)("maps %s to %i", async (error, status) => {
    buildSpy.mockRejectedValue(error);
    const result = await handleGetStaffInvitationPreviewRequest(AUTH, PROJECT_ID, "COMMON", staffAuth, deps);
    expect(result.status).toBe(status);
    expect(result.body).toEqual({ error: error.message });
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
  });

  it.each([
    new actualBuilder.StaffInvitationPreviewInvariantError("design belongs to project-x storage/path/a.jpg"),
    new Error('relation "invitation_versions" does not exist at https://x.supabase.co/sign?token=secret'),
    new ApiError("INTERNAL", "pg detail"),
  ])("invariant/load failure → generic 500 without internal detail (%#)", async (error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    buildSpy.mockRejectedValue(error);
    const result = await handleGetStaffInvitationPreviewRequest(AUTH, PROJECT_ID, "COMMON", staffAuth, deps);
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: "Internal server error" });
    for (const call of log.mock.calls) {
      expect(JSON.stringify(call)).not.toMatch(/storage|supabase|secret|pg detail/);
    }
    log.mockRestore();
  });
});

describe("staff preview route — static boundary", () => {
  const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
  const routeSource = readFileSync(
    join(REPO_ROOT, "app/api/v2/internal/projects/[id]/preview/route.ts"),
    "utf8",
  );
  const handlerSource = readFileSync(join(REPO_ROOT, "lib/server/routes/invitation-preview.ts"), "utf8");

  it("wires the real staff auth gateway and the frozen production preview dependencies", () => {
    expect(routeSource).toContain("supabaseStaffAuthGateway");
    expect(routeSource).toContain("supabaseStaffInvitationPreviewDependencies");
    expect(handlerSource).toContain("buildStaffInvitationPreview(");
    expect(handlerSource).toContain("requireStaff(");
  });

  const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("exposes GET only and its code has no write, publish, service_role or renderer-key literal", () => {
    expect(routeSource).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    for (const source of [routeSource, handlerSource].map(stripComments)) {
      expect(source).not.toMatch(/service_role|serviceRole|SERVICE_ROLE|service-role-client/);
      expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
      expect(source).not.toMatch(/invitation_versions|publish/i);
      expect(source).not.toMatch(/elegant-editorial|wedding\.[a-z-]+\.v\d/);
    }
  });
});
