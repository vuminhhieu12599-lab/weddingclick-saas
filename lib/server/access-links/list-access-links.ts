import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type {
  AccessLinkInventoryItem,
  AccessLinkInventoryRow,
  AccessLinkStatus,
} from "./access-link-inventory-types";
import type { AccessLinkInventoryGateway } from "./access-link-inventory-gateway";

/**
 * Same precedence as the frozen resolver (resolve-access-link.ts G/H):
 * revoked first, then `expires_at <= now`. Never inferred from token data.
 */
export function deriveAccessLinkStatus(row: AccessLinkInventoryRow, now: Date): AccessLinkStatus {
  if (row.revokedAt !== null) {
    return "REVOKED";
  }
  if (row.expiresAt !== null && new Date(row.expiresAt).getTime() <= now.getTime()) {
    return "EXPIRED";
  }
  return "ACTIVE";
}

/** Newest first, id descending as the deterministic tie-break. */
function compareNewestFirst(a: AccessLinkInventoryItem, b: AccessLinkInventoryItem): number {
  const byCreated = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (byCreated !== 0) {
    return byCreated;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * List-Access-Links use case (Launch Hardening 02 / P0-1). Staff-only read of
 * EVERY INTAKE/REVIEW/PORTAL link of one Project, so an old or leaked link is
 * discoverable after a reload. The Project is verified first (unknown → 404);
 * the repository returns the complete Project-scoped set or fails closed, so
 * an active link can never be hidden by a row cap. Active links come first,
 * then inactive history; each group newest first.
 */
export async function listAccessLinks<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: AccessLinkInventoryGateway<TClient>,
  now: () => Date = () => new Date(),
): Promise<AccessLinkInventoryItem[]> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const exists = await gateway.projectExists(staff.supabase, rawProjectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const rows = await gateway.listAccessLinks(staff.supabase, rawProjectId);
  const at = now();
  const items = rows.map(
    (row): AccessLinkInventoryItem => ({
      id: row.id,
      linkType: row.linkType,
      status: deriveAccessLinkStatus(row, at),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      lastUsedAt: row.lastUsedAt,
    }),
  );

  const active = items.filter((item) => item.status === "ACTIVE").sort(compareNewestFirst);
  const inactive = items.filter((item) => item.status !== "ACTIVE").sort(compareNewestFirst);
  return [...active, ...inactive];
}
