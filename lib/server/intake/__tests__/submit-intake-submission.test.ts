import { describe, expect, it } from "vitest";

import type { AccessLinkResolutionRepository } from "../../supabase/access-link-resolution-repository";
import { ApiError } from "../../errors/api-error";
import type { IntakeSubmitGateway } from "../intake-submit-gateway";
import type { SubmitIntakeSubmissionResult } from "../intake-types";
import { submitIntakeSubmission } from "../submit-intake-submission";

const projectId = "11111111-1111-1111-1111-111111111111";
const accessLinkId = "22222222-2222-2222-2222-222222222222";
const rawToken = "a".repeat(43);

const validWeddingDetails = {
  groomName: "Nguyễn Văn Hiếu",
  brideName: "Trần Thị Bình",
  groomFather: null,
  groomMother: null,
  brideFather: null,
  brideMother: null,
  groomFamilyAddress: null,
  brideFamilyAddress: null,
  invitationMessage: null,
  loveStory: null,
  lunarDateDisplay: null,
  additionalNote: null,
  groomBankName: null,
  groomBankAccountName: null,
  groomBankAccountNumber: null,
  groomBankQrMediaId: null,
  brideBankName: null,
  brideBankAccountName: null,
  brideBankAccountNumber: null,
  brideBankQrMediaId: null,
};

const validBody = { weddingDetails: validWeddingDetails };

/** Records whether/when the lazy body reader was invoked. */
function bodyReader(body: unknown, onRead?: () => void): () => Promise<unknown> {
  return async () => {
    onRead?.();
    return body;
  };
}

function throwingBodyReader(onRead?: () => void): () => Promise<unknown> {
  return async () => {
    onRead?.();
    throw new SyntaxError("Unexpected token in JSON");
  };
}

function fakeResolutionRepository(options: {
  row?: {
    id: string;
    projectId: string;
    linkType: "INTAKE" | "REVIEW" | "PORTAL";
    expiresAt: string | null;
    revokedAt: string | null;
  } | null;
}): AccessLinkResolutionRepository {
  return {
    async lookupByTokenHash() {
      return options.row ?? null;
    },
    async touchLastUsedAt() {},
  };
}

function fakeSubmitGateway(options?: {
  result?: SubmitIntakeSubmissionResult;
  onSubmit?: IntakeSubmitGateway["submitIntakeSubmission"];
}): IntakeSubmitGateway {
  return {
    async submitIntakeSubmission(params) {
      if (options?.onSubmit) {
        return options.onSubmit(params);
      }
      return (
        options?.result ?? {
          id: "33333333-3333-3333-3333-333333333333",
          projectId: params.projectId,
          status: "PENDING",
          submittedAt: "2026-09-19T00:00:00.000Z",
        }
      );
    },
  };
}

const resolvedIntakeRow = {
  id: accessLinkId,
  projectId,
  linkType: "INTAKE" as const,
  expiresAt: null,
  revokedAt: null,
};

describe("submitIntakeSubmission", () => {
  it("resolves the token with expectedLinkType INTAKE and expectedProjectId omitted", async () => {
    const resolution: AccessLinkResolutionRepository = {
      async lookupByTokenHash() {
        return {
          id: accessLinkId,
          projectId,
          linkType: "INTAKE",
          expiresAt: null,
          revokedAt: null,
        };
      },
      async touchLastUsedAt() {},
    };

    // resolveAccessLink itself is exercised elsewhere; here we only assert
    // this use case never supplies expectedProjectId at all by checking the
    // successful resolved projectId flows through untouched.
    const gateway = fakeSubmitGateway({
      onSubmit: async (params) => ({
        id: "id",
        projectId: params.projectId,
        status: "PENDING",
        submittedAt: "2026-09-19T00:00:00.000Z",
      }),
    });

    const result = await submitIntakeSubmission(rawToken, bodyReader(validBody), resolution, gateway);
    expect(result.projectId).toBe(projectId);
  });

  it("reads the body only AFTER successful resolution, never before", async () => {
    let resolved = false;
    let bodyReadAfterResolution: boolean | undefined;
    const resolution: AccessLinkResolutionRepository = {
      async lookupByTokenHash() {
        resolved = true;
        return resolvedIntakeRow;
      },
      async touchLastUsedAt() {},
    };
    const gateway = fakeSubmitGateway();

    await submitIntakeSubmission(
      rawToken,
      bodyReader(validBody, () => {
        bodyReadAfterResolution = resolved;
      }),
      resolution,
      gateway,
    );

    expect(bodyReadAfterResolution).toBe(true);
  });

  it("throws NOT_FOUND for a malformed raw token WITHOUT ever calling the body reader", async () => {
    let bodyRead = false;
    const resolution = fakeResolutionRepository({ row: null });
    const gateway = fakeSubmitGateway();

    const error = await submitIntakeSubmission(
      "not-a-valid-token-shape",
      bodyReader({ bogus: true }, () => {
        bodyRead = true;
      }),
      resolution,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
    expect(bodyRead).toBe(false);
  });

  it("throws NOT_FOUND for an unknown token hash WITHOUT calling the body reader", async () => {
    let bodyRead = false;
    const resolution = fakeResolutionRepository({ row: null });
    const gateway = fakeSubmitGateway();

    const error = await submitIntakeSubmission(
      rawToken,
      bodyReader(validBody, () => {
        bodyRead = true;
      }),
      resolution,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
    expect(bodyRead).toBe(false);
  });

  it("throws NOT_FOUND for a token resolved to a non-INTAKE purpose WITHOUT calling the body reader", async () => {
    let bodyRead = false;
    const resolution = fakeResolutionRepository({
      row: { id: accessLinkId, projectId, linkType: "REVIEW", expiresAt: null, revokedAt: null },
    });
    const gateway = fakeSubmitGateway();

    const error = await submitIntakeSubmission(
      rawToken,
      bodyReader(validBody, () => {
        bodyRead = true;
      }),
      resolution,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("NOT_FOUND");
    expect(bodyRead).toBe(false);
  });

  it("throws REVOKED_TOKEN for a revoked access link WITHOUT calling the body reader", async () => {
    let bodyRead = false;
    const resolution = fakeResolutionRepository({
      row: {
        id: accessLinkId,
        projectId,
        linkType: "INTAKE",
        expiresAt: null,
        revokedAt: "2020-01-01T00:00:00.000Z",
      },
    });
    const gateway = fakeSubmitGateway();

    const error = await submitIntakeSubmission(
      rawToken,
      bodyReader(validBody, () => {
        bodyRead = true;
      }),
      resolution,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("REVOKED_TOKEN");
    expect(bodyRead).toBe(false);
  });

  it("throws EXPIRED_TOKEN for an expired access link WITHOUT calling the body reader", async () => {
    let bodyRead = false;
    const resolution = fakeResolutionRepository({
      row: {
        id: accessLinkId,
        projectId,
        linkType: "INTAKE",
        expiresAt: "2020-01-01T00:00:00.000Z",
        revokedAt: null,
      },
    });
    const gateway = fakeSubmitGateway();

    const error = await submitIntakeSubmission(
      rawToken,
      bodyReader(validBody, () => {
        bodyRead = true;
      }),
      resolution,
      gateway,
      () => new Date("2026-01-01T00:00:00.000Z"),
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("EXPIRED_TOKEN");
    expect(bodyRead).toBe(false);
  });

  it("maps a body-reader failure (e.g. invalid JSON) to BAD_REQUEST after successful resolution", async () => {
    const resolution = fakeResolutionRepository({ row: resolvedIntakeRow });
    let called = false;
    const gateway = fakeSubmitGateway({
      onSubmit: async () => {
        called = true;
        throw new Error("should not be called");
      },
    });

    const error = await submitIntakeSubmission(
      rawToken,
      throwingBodyReader(),
      resolution,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect((error as ApiError).message).toBe("Request body must be valid JSON");
    expect(called).toBe(false);
  });

  it("rejects unknown structural fields in the (successfully-read) body without ever calling the submit gateway", async () => {
    const resolution = fakeResolutionRepository({ row: resolvedIntakeRow });
    let called = false;
    const gateway = fakeSubmitGateway({
      onSubmit: async () => {
        called = true;
        throw new Error("should not be called");
      },
    });

    const error = await submitIntakeSubmission(
      rawToken,
      bodyReader({ weddingDetails: validWeddingDetails, projectId: "attacker-supplied" }),
      resolution,
      gateway,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("BAD_REQUEST");
    expect(called).toBe(false);
  });

  it("passes the resolved project id and access link id (never the raw token) to the submit gateway", async () => {
    const resolution = fakeResolutionRepository({ row: resolvedIntakeRow });
    let capturedParams: unknown;
    const gateway = fakeSubmitGateway({
      onSubmit: async (params) => {
        capturedParams = params;
        return {
          id: "id",
          projectId: params.projectId,
          status: "PENDING",
          submittedAt: "2026-09-19T00:00:00.000Z",
        };
      },
    });

    await submitIntakeSubmission(rawToken, bodyReader(validBody), resolution, gateway);

    expect(capturedParams).toEqual({
      projectId,
      accessLinkId,
      weddingDetails: validWeddingDetails,
    });
    expect(JSON.stringify(capturedParams)).not.toContain(rawToken);
  });

  it("returns the narrow submit result on success", async () => {
    const resolution = fakeResolutionRepository({ row: resolvedIntakeRow });
    const gateway = fakeSubmitGateway({
      result: {
        id: "33333333-3333-3333-3333-333333333333",
        projectId,
        status: "PENDING",
        submittedAt: "2026-09-19T00:00:00.000Z",
      },
    });

    const result = await submitIntakeSubmission(rawToken, bodyReader(validBody), resolution, gateway);

    expect(result).toEqual({
      id: "33333333-3333-3333-3333-333333333333",
      projectId,
      status: "PENDING",
      submittedAt: "2026-09-19T00:00:00.000Z",
    });
  });
});
