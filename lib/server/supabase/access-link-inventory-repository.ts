import type { SupabaseClient } from "@supabase/supabase-js";

import { ACCESS_LINK_TYPES, type AccessLinkType } from "../../domain";
import type { AccessLinkInventoryGateway } from "../access-links/access-link-inventory-gateway";
import type { AccessLinkInventoryRow } from "../access-links/access-link-inventory-types";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Production AccessLinkInventoryGateway (Launch Hardening 02 / P0-1). Always
 * invoked with the staff-scoped client (Task 004) — RLS `is_staff()` plus the
 * authenticated SELECT grant of migration 0014 are the authority; never
 * `service_role`.
 *
 * Explicit columns only: `token_hash`, `token_hint` and `created_by` are never
 * selected. Read-only — this module has no insert/update/delete/rpc call.
 */
const INVENTORY_COLUMNS = "id, project_id, link_type, created_at, expires_at, revoked_at, last_used_at";

function fail(): never {
  throw new Error("Failed to query project access links");
}

function isAccessLinkType(value: unknown): value is AccessLinkType {
  return typeof value === "string" && (ACCESS_LINK_TYPES as readonly string[]).includes(value);
}

function isNullableTimestamptz(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isValidTimestamptz(value));
}

/** Runtime shape guard; a row of any other Project is a hard failure, never filtered out silently. */
function toInventoryRow(row: unknown, projectId: string): AccessLinkInventoryRow {
  if (typeof row !== "object" || row === null) fail();
  const candidate = row as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    !isValidUuid(candidate.id) ||
    candidate.project_id !== projectId ||
    !isAccessLinkType(candidate.link_type) ||
    typeof candidate.created_at !== "string" ||
    !isValidTimestamptz(candidate.created_at) ||
    !isNullableTimestamptz(candidate.expires_at) ||
    !isNullableTimestamptz(candidate.revoked_at) ||
    !isNullableTimestamptz(candidate.last_used_at)
  ) {
    fail();
  }
  return {
    id: candidate.id,
    projectId,
    linkType: candidate.link_type,
    createdAt: candidate.created_at,
    expiresAt: candidate.expires_at,
    revokedAt: candidate.revoked_at,
    lastUsedAt: candidate.last_used_at,
  };
}

export const supabaseAccessLinkInventoryGateway: AccessLinkInventoryGateway<SupabaseClient> = {
  async projectExists(client, projectId) {
    const { data, error } = await client.from("projects").select("id").eq("id", projectId).maybeSingle();
    if (error) {
      throw new Error("Failed to query project");
    }
    return data !== null;
  },

  async listAccessLinks(client, projectId) {
    const { data, error, count } = await client
      .from("project_access_links")
      .select(INVENTORY_COLUMNS, { count: "exact" })
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (error || !Array.isArray(data)) fail();
    // A server row cap must never silently hide an active credential.
    if (count !== data.length) fail();
    return data.map((row: unknown) => toInventoryRow(row, projectId));
  },
};
