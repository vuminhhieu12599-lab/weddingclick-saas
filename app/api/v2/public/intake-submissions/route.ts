import { NextResponse } from "next/server";

import { getServiceRoleAccessLinkResolutionRepository } from "../../../../../lib/server/supabase/access-link-resolution-repository";
import { handleSubmitIntakeRequest } from "../../../../../lib/server/routes/intake";
import { getServiceRoleIntakeSubmitGateway } from "../../../../../lib/server/supabase/intake-submit-repository";

/**
 * POST /api/v2/public/intake-submissions (Task 027 Phase 2) — public
 * customer INTAKE submission. Authentication transport is
 * `Authorization: Bearer <raw INTAKE token>`, NOT Supabase Auth — this route
 * never reads a Supabase session. `projectId`/`accessLinkId` are never read
 * from the URL or the request body; both come only from the resolved token
 * context.
 *
 * Both the token-resolution repository and the intake-submit gateway create
 * a fresh service_role client per request (no top-level/module-scope
 * client, no cached secret) — constructed here, per call, never at module
 * scope.
 *
 * The request body is deliberately NOT read here (Task 027 Phase 2
 * Independent Review Patch 1, Finding A) — `request.json` is passed as a
 * lazy, uninvoked callback so the handler/use case reads it only after
 * token resolution has already succeeded. Reading it eagerly here would let
 * a malformed-JSON body preempt or reorder the frozen
 * auth-transport/resolver error precedence.
 */
export async function POST(request: Request) {
  const result = await handleSubmitIntakeRequest(
    request.headers.get("authorization"),
    () => request.json(),
    getServiceRoleAccessLinkResolutionRepository(),
    getServiceRoleIntakeSubmitGateway(),
  );

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
