import { generateAccessToken } from "../auth/access-token-crypto";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { AccessLinkStaffGateway } from "./access-link-staff-gateway";
import type { RotateAccessLinkResult } from "./access-link-staff-types";

/**
 * Rotate-Access-Link use case (Task 026 Phase 3). Always calls the
 * `rotate_access_link` RPC via the gateway — never a plain RLS
 * INSERT/UPDATE — so the source-row validation, atomic revoke-then-replace,
 * and audited `ACCESS_LINK_ROTATED` activity log all happen server-side in
 * one transaction (migration 0025, docs/DECISIONS.md D8). No expiry or
 * link-type input is accepted from the caller — the replacement row
 * preserves both from the source, entirely inside the RPC.
 *
 * A fresh raw token is generated exactly once via `generateAccessToken()`
 * and returned only after the RPC call has actually succeeded; the old
 * token is never re-derivable (the RPC never returns `token_hash`) and is
 * never referenced by this use case at all.
 */
export async function rotateAccessLink<TClient>(
  rawProjectId: string,
  rawAccessLinkId: string,
  staff: StaffContext<TClient>,
  gateway: AccessLinkStaffGateway<TClient>,
): Promise<RotateAccessLinkResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  if (!isValidUuid(rawAccessLinkId)) {
    throw new ApiError("BAD_REQUEST", "Access link id must be a valid UUID");
  }

  const generated = generateAccessToken();

  const record = await gateway.rotateAccessLink(staff.supabase, {
    projectId: rawProjectId,
    accessLinkId: rawAccessLinkId,
    newTokenHash: generated.tokenHash,
    newTokenHint: generated.tokenHint,
  });

  return { record, token: generated.rawToken };
}
