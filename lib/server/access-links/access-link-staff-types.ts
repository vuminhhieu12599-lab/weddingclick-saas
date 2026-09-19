import type { AccessLinkType } from "../../domain";

/**
 * Staff mutation domain shapes (Task 026 Phase 3 — issue/rotate/revoke).
 * Deliberately separate from lib/server/access-links/access-link-resolution-types.ts
 * (Phase 2, service_role-backed token resolution) — the two modules must
 * never share types or import graphs (see the Phase 3 static-security-review
 * test).
 *
 * `IssuedAccessLinkRecord`/`RevokedAccessLinkRecord` deliberately exclude
 * tokenHash/tokenHint — neither is ever returned to an HTTP caller (frozen
 * Phase 3 response contract). `createdBy` is likewise excluded — it is
 * write-only (staff.userId at issuance time), never read back.
 */
export interface IssuedAccessLinkRecord {
  id: string;
  projectId: string;
  linkType: AccessLinkType;
  expiresAt: string | null;
  createdAt: string;
}

export interface RevokedAccessLinkRecord {
  id: string;
  projectId: string;
  linkType: AccessLinkType;
  revokedAt: string;
}

/** Use-case-level result: the persisted record plus the one-time raw token. */
export interface IssueAccessLinkResult {
  record: IssuedAccessLinkRecord;
  token: string;
}

export interface RotateAccessLinkResult {
  record: IssuedAccessLinkRecord;
  token: string;
}

/**
 * Repository-level input for the INTAKE/PORTAL direct-RLS INSERT — exactly
 * the six columns docs/DECISIONS.md D12 permits a direct authenticated
 * INSERT to carry. `tokenHash` is the raw SHA-256 digest bytes (never a raw
 * token, never persisted as anything else); the repository owns converting
 * it to the DB's BYTEA wire representation.
 */
export interface DirectIssueAccessLinkRow {
  projectId: string;
  linkType: AccessLinkType;
  tokenHash: Uint8Array;
  tokenHint: string;
  expiresAt: string | null;
  createdBy: string;
}

/** issue_review_link RPC params (migration 0025) — no p_link_type, always REVIEW. */
export interface ReviewIssueAccessLinkParams {
  projectId: string;
  tokenHash: Uint8Array;
  tokenHint: string;
  expiresAt: string | null;
}

/** rotate_access_link RPC params (migration 0025) — no expiry/link-type input from the caller. */
export interface RotateAccessLinkParams {
  projectId: string;
  accessLinkId: string;
  newTokenHash: Uint8Array;
  newTokenHint: string;
}

/** revoke_access_link RPC params (migration 0025) — no token generation. */
export interface RevokeAccessLinkParams {
  projectId: string;
  accessLinkId: string;
}
