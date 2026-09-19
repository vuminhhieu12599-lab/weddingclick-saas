import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { AccessLinkStaffGateway } from "./access-link-staff-gateway";
import type { RevokedAccessLinkRecord } from "./access-link-staff-types";

/**
 * Revoke-Access-Link use case (Task 026 Phase 3). Always calls the
 * `revoke_access_link` RPC via the gateway — never a plain RLS UPDATE — so
 * the not-found/already-revoked validation and audited
 * `ACCESS_LINK_REVOKED` activity log happen server-side atomically
 * (migration 0025, docs/DECISIONS.md D9). No token is generated; an
 * expired-but-not-revoked link remains revocable because the RPC, not this
 * use case, owns that rule.
 */
export async function revokeAccessLink<TClient>(
  rawProjectId: string,
  rawAccessLinkId: string,
  staff: StaffContext<TClient>,
  gateway: AccessLinkStaffGateway<TClient>,
): Promise<RevokedAccessLinkRecord> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  if (!isValidUuid(rawAccessLinkId)) {
    throw new ApiError("BAD_REQUEST", "Access link id must be a valid UUID");
  }

  return gateway.revokeAccessLink(staff.supabase, {
    projectId: rawProjectId,
    accessLinkId: rawAccessLinkId,
  });
}
