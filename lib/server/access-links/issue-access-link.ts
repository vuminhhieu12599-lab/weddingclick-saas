import { generateAccessToken } from "../auth/access-token-crypto";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { AccessLinkStaffGateway } from "./access-link-staff-gateway";
import type { IssueAccessLinkResult } from "./access-link-staff-types";
import { validateIssueAccessLinkInput } from "./validate-issue-access-link-input";

/**
 * Issue-Access-Link use case (Task 026 Phase 3). Branches on `linkType`:
 *
 * - INTAKE/PORTAL: verifies the target Project exists via a direct RLS read
 *   first (mirrors lib/server/media/finalize-media.ts's projectExists
 *   precheck ahead of a plain RLS INSERT — there is no RPC here to make
 *   existence-checking atomic, unlike REVIEW), then performs the direct
 *   RLS INSERT (docs/API_CONTRACT.md §7.4) with `created_by` bound to the
 *   caller's own `staff.userId` — never request input.
 * - REVIEW: no pre-read. Calls `issue_review_link` directly; the RPC's own
 *   AL002 (Project not found) is the sole authority (mirrors Task 025's
 *   "no pre-read before RPC" convention).
 *
 * The raw token is generated in memory via the real `generateAccessToken()`
 * and only ever returned to the caller after the DB mutation has actually
 * succeeded — on any failure it simply falls out of scope, never logged,
 * never persisted, never included in an error.
 */
export async function issueAccessLink<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: AccessLinkStaffGateway<TClient>,
): Promise<IssueAccessLinkResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const input = validateIssueAccessLinkInput(rawBody);

  if (input.linkType === "REVIEW") {
    const generated = generateAccessToken();

    const record = await gateway.issueReviewLink(staff.supabase, {
      projectId: rawProjectId,
      tokenHash: generated.tokenHash,
      tokenHint: generated.tokenHint,
      expiresAt: input.expiresAt,
    });

    return { record, token: generated.rawToken };
  }

  const exists = await gateway.projectExists(staff.supabase, rawProjectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const generated = generateAccessToken();

  const record = await gateway.issueDirectAccessLink(staff.supabase, {
    projectId: rawProjectId,
    linkType: input.linkType,
    tokenHash: generated.tokenHash,
    tokenHint: generated.tokenHint,
    expiresAt: input.expiresAt,
    createdBy: staff.userId,
  });

  return { record, token: generated.rawToken };
}
