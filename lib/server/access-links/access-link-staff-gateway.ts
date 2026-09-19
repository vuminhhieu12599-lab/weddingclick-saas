import type {
  DirectIssueAccessLinkRow,
  IssuedAccessLinkRecord,
  RevokeAccessLinkParams,
  RevokedAccessLinkRecord,
  ReviewIssueAccessLinkParams,
  RotateAccessLinkParams,
} from "./access-link-staff-types";

/**
 * Narrow seam (Task 026 Phase 3, mirrors ProjectEventsGateway/
 * ProjectLifecycleGateway) that decouples the issue/rotate/revoke use cases
 * from the real @supabase/supabase-js client shape.
 *
 * `projectExists` is a plain DIRECT RLS read, used only ahead of the
 * INTAKE/PORTAL direct INSERT (never ahead of a trusted RPC — REVIEW issue,
 * rotate, and revoke all let their own RPC be the sole authority for
 * existence/state, exactly like Task 025's gateways).
 *
 * `issueDirectAccessLink` is a plain DIRECT RLS INSERT (INTAKE/PORTAL only —
 * docs/API_CONTRACT.md §7.4). `issueReviewLink`/`rotateAccessLink`/
 * `revokeAccessLink` each call exactly one of the three migration-0025
 * TRUSTED BUSINESS ACTION RPCs. No generic insert/update/rpc-passthrough
 * method is exposed — every capability here maps to exactly one frozen
 * business operation.
 */
export interface AccessLinkStaffGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  issueDirectAccessLink(
    client: TClient,
    row: DirectIssueAccessLinkRow,
  ): Promise<IssuedAccessLinkRecord>;
  issueReviewLink(
    client: TClient,
    params: ReviewIssueAccessLinkParams,
  ): Promise<IssuedAccessLinkRecord>;
  rotateAccessLink(
    client: TClient,
    params: RotateAccessLinkParams,
  ): Promise<IssuedAccessLinkRecord>;
  revokeAccessLink(
    client: TClient,
    params: RevokeAccessLinkParams,
  ): Promise<RevokedAccessLinkRecord>;
}
