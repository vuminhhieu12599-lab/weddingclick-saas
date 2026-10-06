import type { AccessLinkInventoryRow } from "./access-link-inventory-types";

/**
 * Read-only seam for the staff access-link inventory (Launch Hardening 02 /
 * P0-1). Kept separate from the frozen Task 026 `AccessLinkStaffGateway`
 * (issue/rotate/revoke), which is unchanged; revocation still goes through
 * that gateway's `revokeAccessLink` → `revoke_access_link` RPC.
 *
 * Both methods are plain staff-session RLS reads (`project_access_links_select_staff`,
 * `is_staff()`), never `service_role`.
 */
export interface AccessLinkInventoryGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  /**
   * Every access link of exactly this Project, or a thrown failure — never a
   * silently truncated subset.
   */
  listAccessLinks(client: TClient, projectId: string): Promise<AccessLinkInventoryRow[]>;
}
