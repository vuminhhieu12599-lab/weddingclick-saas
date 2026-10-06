import type { AccessLinkType } from "../../domain";

/**
 * Staff access-link inventory shapes (Launch Hardening 02 / P0-1).
 *
 * `AccessLinkInventoryRow` is the repository read of one `project_access_links`
 * row of the requested Project — stable non-secret metadata only. It never
 * carries `token_hash`, `token_hint` or `created_by`; `projectId` is read back
 * solely so the repository can re-check exact Project scope and is never
 * returned to an HTTP caller.
 */
export interface AccessLinkInventoryRow {
  id: string;
  projectId: string;
  linkType: AccessLinkType;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

/**
 * Derived from persisted fields only, with the exact precedence the frozen
 * token resolver applies (lib/server/access-links/resolve-access-link.ts):
 * `revoked_at` set wins (REVOKED), else `expires_at <= now` (EXPIRED), else
 * ACTIVE.
 */
export type AccessLinkStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

/**
 * One inventory item as returned to staff. `id` is the staff mutation target
 * (revoke), never a capability credential. No token material, no Project id,
 * no creator id.
 */
export interface AccessLinkInventoryItem {
  id: string;
  linkType: AccessLinkType;
  status: AccessLinkStatus;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}
