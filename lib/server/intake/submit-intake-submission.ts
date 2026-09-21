import { resolveAccessLink } from "../access-links/resolve-access-link";
import { ApiError } from "../errors/api-error";
import type { AccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import { validateSubmitIntakeInput } from "./validate-submit-intake-input";
import type { IntakeSubmitGateway } from "./intake-submit-gateway";
import type { SubmitIntakeSubmissionResult } from "./intake-types";

/**
 * Public Submit-Intake use case (Task 027 Phase 2, frozen contract §2.1).
 * Exact frozen flow, in order:
 *
 *   1. (transport parsing happens in the route handler, before this is
 *      called — see lib/server/routes/intake.ts)
 *   2. Resolve the raw token with the frozen Task 026 resolver:
 *      expectedLinkType = "INTAKE", expectedProjectId omitted.
 *   3. Read and validate the request body (Task-022-shaped `weddingDetails`).
 *   4. Invoke the Phase-1 service-role-only `submit_intake_submission` RPC
 *      via the narrow submit gateway, passing only the resolved ids plus
 *      validated fields — never the raw token.
 *
 * `readBody` is deliberately a lazy callback, not an already-materialized
 * value (Task 027 Phase 2 Independent Review Patch 1, Finding A): the
 * request body must never be read/parsed until AFTER token resolution has
 * already succeeded, so a missing/malformed/unknown/wrong-purpose/revoked/
 * expired token always fails at the resolver boundary — never observably
 * influenced by, or preempted by, a body-parsing failure. A `readBody()`
 * failure (e.g. invalid JSON) is reported as BAD_REQUEST, exactly like a
 * structurally invalid — but syntactically valid — body.
 *
 * Every resolver failure (malformed/unknown/wrong-purpose -> NOT_FOUND;
 * revoked -> REVOKED_TOKEN; expired -> EXPIRED_TOKEN) propagates unchanged —
 * this use case never touches or reinterprets resolveAccessLink()'s own
 * error contract (frozen §2.1: "Do NOT alter the Task-026 resolver").
 */
export async function submitIntakeSubmission(
  rawToken: string,
  readBody: () => Promise<unknown>,
  resolutionRepository: AccessLinkResolutionRepository,
  submitGateway: IntakeSubmitGateway,
  now: () => Date = () => new Date(),
): Promise<SubmitIntakeSubmissionResult> {
  const resolved = await resolveAccessLink(
    { rawToken, expectedLinkType: "INTAKE" },
    resolutionRepository,
    now,
  );

  let rawBody: unknown;
  try {
    rawBody = await readBody();
  } catch {
    throw new ApiError("BAD_REQUEST", "Request body must be valid JSON");
  }

  const weddingDetails = validateSubmitIntakeInput(rawBody);

  return submitGateway.submitIntakeSubmission({
    projectId: resolved.projectId,
    accessLinkId: resolved.accessLinkId,
    weddingDetails,
  });
}
