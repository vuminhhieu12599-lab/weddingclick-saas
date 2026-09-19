import { describe, expect, it, vi } from "vitest";

import { generateAccessToken } from "../../auth/access-token-crypto";
import { ApiError } from "../../errors/api-error";
import type {
  AccessLinkResolutionRepository,
  ResolvedAccessLinkRow,
} from "../../supabase/access-link-resolution-repository";
import { resolveAccessLink } from "../resolve-access-link";

const accessLinkId = "11111111-1111-1111-1111-111111111111";
const projectId = "22222222-2222-2222-2222-222222222222";
const otherProjectId = "33333333-3333-3333-3333-333333333333";

const validRawToken = generateAccessToken().rawToken;

function baseRow(overrides: Partial<ResolvedAccessLinkRow> = {}): ResolvedAccessLinkRow {
  return {
    id: accessLinkId,
    projectId,
    linkType: "REVIEW",
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function fakeRepository(options: {
  row?: ResolvedAccessLinkRow | null;
  lookupError?: Error;
  touchError?: Error;
}): { repository: AccessLinkResolutionRepository; calls: { lookup: number; touch: string[] } } {
  const calls = { lookup: 0, touch: [] as string[] };
  const repository: AccessLinkResolutionRepository = {
    async lookupByTokenHash() {
      calls.lookup += 1;
      if (options.lookupError) {
        throw options.lookupError;
      }
      return options.row ?? null;
    },
    async touchLastUsedAt(accessLinkIdArg: string) {
      calls.touch.push(accessLinkIdArg);
      if (options.touchError) {
        throw options.touchError;
      }
    },
  };
  return { repository, calls };
}

async function expectApiError(promise: Promise<unknown>, kind: string): Promise<void> {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).kind).toBe(kind);
}

describe("resolveAccessLink — malformed token shape", () => {
  it("rejects an empty token as NOT_FOUND without calling the repository", async () => {
    const { repository, calls } = fakeRepository({ row: baseRow() });
    await expectApiError(
      resolveAccessLink({ rawToken: "", expectedLinkType: "REVIEW" }, repository),
      "NOT_FOUND",
    );
    expect(calls.lookup).toBe(0);
  });

  it("rejects a wrong-length token as NOT_FOUND without calling the repository", async () => {
    const { repository, calls } = fakeRepository({ row: baseRow() });
    await expectApiError(
      resolveAccessLink({ rawToken: "a".repeat(42), expectedLinkType: "REVIEW" }, repository),
      "NOT_FOUND",
    );
    expect(calls.lookup).toBe(0);
  });

  it("rejects a padded token as NOT_FOUND without calling the repository", async () => {
    const { repository, calls } = fakeRepository({ row: baseRow() });
    await expectApiError(
      resolveAccessLink(
        { rawToken: "a".repeat(42) + "=", expectedLinkType: "REVIEW" },
        repository,
      ),
      "NOT_FOUND",
    );
    expect(calls.lookup).toBe(0);
  });

  it("rejects a token with an out-of-alphabet character as NOT_FOUND without calling the repository", async () => {
    const { repository, calls } = fakeRepository({ row: baseRow() });
    await expectApiError(
      resolveAccessLink(
        { rawToken: "a".repeat(42) + "!", expectedLinkType: "REVIEW" },
        repository,
      ),
      "NOT_FOUND",
    );
    expect(calls.lookup).toBe(0);
  });
});

describe("resolveAccessLink — unknown/wrong-purpose/wrong-project (anti-enumeration)", () => {
  it("unknown hash -> NOT_FOUND", async () => {
    const { repository } = fakeRepository({ row: null });
    await expectApiError(
      resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, repository),
      "NOT_FOUND",
    );
  });

  it("wrong purpose -> NOT_FOUND", async () => {
    const { repository } = fakeRepository({ row: baseRow({ linkType: "INTAKE" }) });
    await expectApiError(
      resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, repository),
      "NOT_FOUND",
    );
  });

  it("wrong project -> NOT_FOUND", async () => {
    const { repository } = fakeRepository({ row: baseRow({ projectId: otherProjectId }) });
    await expectApiError(
      resolveAccessLink(
        { rawToken: validRawToken, expectedLinkType: "REVIEW", expectedProjectId: projectId },
        repository,
      ),
      "NOT_FOUND",
    );
  });

  it("all three produce the exact same ApiError kind and message (indistinguishable to a caller)", async () => {
    const unknown = fakeRepository({ row: null });
    const wrongPurpose = fakeRepository({ row: baseRow({ linkType: "INTAKE" }) });
    const wrongProject = fakeRepository({ row: baseRow({ projectId: otherProjectId }) });

    const [errUnknown, errPurpose, errProject] = await Promise.all([
      resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, unknown.repository).catch(
        (e) => e,
      ),
      resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, wrongPurpose.repository).catch(
        (e) => e,
      ),
      resolveAccessLink(
        { rawToken: validRawToken, expectedLinkType: "REVIEW", expectedProjectId: projectId },
        wrongProject.repository,
      ).catch((e) => e),
    ]);

    expect(errUnknown.kind).toBe("NOT_FOUND");
    expect(errPurpose.kind).toBe("NOT_FOUND");
    expect(errProject.kind).toBe("NOT_FOUND");
    expect(errUnknown.message).toBe(errPurpose.message);
    expect(errPurpose.message).toBe(errProject.message);
  });

  it("project binding is skipped when expectedProjectId is not supplied", async () => {
    const { repository, calls } = fakeRepository({ row: baseRow({ projectId: otherProjectId }) });
    const result = await resolveAccessLink(
      { rawToken: validRawToken, expectedLinkType: "REVIEW" },
      repository,
    );
    expect(result.projectId).toBe(otherProjectId);
    expect(calls.touch).toEqual([accessLinkId]);
  });

  it("wrong purpose + revoked -> NOT_FOUND (revoked state is not disclosed across a purpose mismatch), touchLastUsedAt never called", async () => {
    const { repository, calls } = fakeRepository({
      row: baseRow({
        linkType: "INTAKE",
        revokedAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    await expectApiError(
      resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, repository),
      "NOT_FOUND",
    );
    expect(calls.touch).toEqual([]);
  });

  it("wrong project + expired -> NOT_FOUND (expired state is not disclosed across a project mismatch), touchLastUsedAt never called", async () => {
    const now = () => new Date("2026-06-01T00:00:00.000Z");
    const { repository, calls } = fakeRepository({
      row: baseRow({
        projectId: otherProjectId,
        expiresAt: "2026-01-01T00:00:00.000Z",
      }),
    });
    await expectApiError(
      resolveAccessLink(
        { rawToken: validRawToken, expectedLinkType: "REVIEW", expectedProjectId: projectId },
        repository,
        now,
      ),
      "NOT_FOUND",
    );
    expect(calls.touch).toEqual([]);
  });
});

describe("resolveAccessLink — revoked/expired ordering", () => {
  it("revoked -> REVOKED_TOKEN", async () => {
    const { repository } = fakeRepository({
      row: baseRow({ revokedAt: "2026-01-01T00:00:00.000Z" }),
    });
    await expectApiError(
      resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, repository),
      "REVOKED_TOKEN",
    );
  });

  it("expired (expires_at <= now) -> EXPIRED_TOKEN", async () => {
    const now = () => new Date("2026-06-01T00:00:00.000Z");
    const { repository } = fakeRepository({
      row: baseRow({ expiresAt: "2026-05-01T00:00:00.000Z" }),
    });
    await expectApiError(
      resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, repository, now),
      "EXPIRED_TOKEN",
    );
  });

  it("expires_at exactly equal to now -> EXPIRED_TOKEN (boundary is inclusive)", async () => {
    const boundary = "2026-06-01T00:00:00.000Z";
    const now = () => new Date(boundary);
    const { repository } = fakeRepository({ row: baseRow({ expiresAt: boundary }) });
    await expectApiError(
      resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, repository, now),
      "EXPIRED_TOKEN",
    );
  });

  it("future expiry remains valid", async () => {
    const now = () => new Date("2026-01-01T00:00:00.000Z");
    const { repository, calls } = fakeRepository({
      row: baseRow({ expiresAt: "2026-12-31T00:00:00.000Z" }),
    });
    const result = await resolveAccessLink(
      { rawToken: validRawToken, expectedLinkType: "REVIEW" },
      repository,
      now,
    );
    expect(result.accessLinkId).toBe(accessLinkId);
    expect(calls.touch).toEqual([accessLinkId]);
  });

  it("null expiry remains valid", async () => {
    const { repository, calls } = fakeRepository({ row: baseRow({ expiresAt: null }) });
    const result = await resolveAccessLink(
      { rawToken: validRawToken, expectedLinkType: "REVIEW" },
      repository,
    );
    expect(result.accessLinkId).toBe(accessLinkId);
    expect(calls.touch).toEqual([accessLinkId]);
  });

  it("revoked AND expired -> REVOKED_TOKEN wins", async () => {
    const now = () => new Date("2026-06-01T00:00:00.000Z");
    const { repository } = fakeRepository({
      row: baseRow({
        revokedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-05-01T00:00:00.000Z",
      }),
    });
    await expectApiError(
      resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, repository, now),
      "REVOKED_TOKEN",
    );
  });
});

describe("resolveAccessLink — success and last_used_at semantics", () => {
  it("returns the narrow validated context on success", async () => {
    const { repository } = fakeRepository({ row: baseRow() });
    const result = await resolveAccessLink(
      { rawToken: validRawToken, expectedLinkType: "REVIEW", expectedProjectId: projectId },
      repository,
    );
    expect(result).toEqual({ accessLinkId, projectId, linkType: "REVIEW" });
  });

  it("never exposes token_hash/token_hint/expiresAt/revokedAt on the returned context", async () => {
    const { repository } = fakeRepository({ row: baseRow() });
    const result = await resolveAccessLink(
      { rawToken: validRawToken, expectedLinkType: "REVIEW" },
      repository,
    );
    expect(result).not.toHaveProperty("tokenHash");
    expect(result).not.toHaveProperty("tokenHint");
    expect(result).not.toHaveProperty("expiresAt");
    expect(result).not.toHaveProperty("revokedAt");
  });

  it("calls touchLastUsedAt exactly once, with the resolved access link id, on success", async () => {
    const { repository, calls } = fakeRepository({ row: baseRow() });
    await resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, repository);
    expect(calls.touch).toEqual([accessLinkId]);
  });

  it.each([
    ["malformed token", { rawToken: "", expectedLinkType: "REVIEW" as const }],
    ["wrong purpose", { rawToken: validRawToken, expectedLinkType: "INTAKE" as const }],
  ])("never calls touchLastUsedAt on a validation failure: %s", async (_label, input) => {
    const { repository, calls } = fakeRepository({ row: baseRow({ linkType: "REVIEW" }) });
    await resolveAccessLink(input, repository).catch(() => undefined);
    expect(calls.touch).toEqual([]);
  });

  it("never calls touchLastUsedAt when unknown/revoked/expired", async () => {
    const unknown = fakeRepository({ row: null });
    await resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, unknown.repository).catch(
      () => undefined,
    );
    expect(unknown.calls.touch).toEqual([]);

    const revoked = fakeRepository({ row: baseRow({ revokedAt: "2026-01-01T00:00:00.000Z" }) });
    await resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, revoked.repository).catch(
      () => undefined,
    );
    expect(revoked.calls.touch).toEqual([]);

    const expired = fakeRepository({ row: baseRow({ expiresAt: "2000-01-01T00:00:00.000Z" }) });
    await resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, expired.repository).catch(
      () => undefined,
    );
    expect(expired.calls.touch).toEqual([]);
  });

  it("last_used_at update failure -> generic INTERNAL failure, not a successful context", async () => {
    const { repository } = fakeRepository({
      row: baseRow(),
      touchError: new Error("Failed to record access link usage"),
    });
    const error = await resolveAccessLink(
      { rawToken: validRawToken, expectedLinkType: "REVIEW" },
      repository,
    ).catch((e) => e);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it("an unexpected repository lookup failure propagates as a generic (non-ApiError) failure", async () => {
    const { repository } = fakeRepository({
      row: null,
      lookupError: new Error("Failed to resolve access link"),
    });
    const error = await resolveAccessLink(
      { rawToken: validRawToken, expectedLinkType: "REVIEW" },
      repository,
    ).catch((e) => e);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("resolveAccessLink — default clock", () => {
  it("uses the real current time when no now() is supplied", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    try {
      const { repository } = fakeRepository({
        row: baseRow({ expiresAt: "2026-05-01T00:00:00.000Z" }),
      });
      await expectApiError(
        resolveAccessLink({ rawToken: validRawToken, expectedLinkType: "REVIEW" }, repository),
        "EXPIRED_TOKEN",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
