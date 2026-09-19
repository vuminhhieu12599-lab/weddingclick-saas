import type { SupabaseClient } from "@supabase/supabase-js";

import { ACCESS_LINK_TYPES, type AccessLinkType } from "../../domain";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";
import { toPostgresByteaHexLiteral } from "./postgres-bytea";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Production access-link token-resolution repository (Task 026 Phase 2,
 * docs/DECISIONS.md D4/D11/D12, docs/API_CONTRACT.md §4). The only place in
 * the codebase that queries `project_access_links` with the `service_role`
 * client, and the only production module that imports
 * lib/server/supabase/service-role-client.ts (see the static import-boundary
 * test in lib/server/access-links/__tests__/token-resolution-static-security-review.test.ts).
 *
 * Exposes exactly the two capabilities the frozen resolution order needs —
 * lookup-by-token-hash and last_used_at bookkeeping — never a generic
 * findAll/update, never a raw query builder, never an INSERT or DELETE (the
 * live DB privilege contract, D12, grants service_role neither).
 */
const ACCESS_LINK_RESOLUTION_COLUMNS = "id, project_id, link_type, expires_at, revoked_at";

export interface ResolvedAccessLinkRow {
  id: string;
  projectId: string;
  linkType: AccessLinkType;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface AccessLinkResolutionRepository {
  lookupByTokenHash(tokenHash: Uint8Array): Promise<ResolvedAccessLinkRow | null>;
  touchLastUsedAt(accessLinkId: string): Promise<void>;
}

interface AccessLinkResolutionRpcRow {
  id: string;
  project_id: string;
  link_type: AccessLinkType;
  expires_at: string | null;
  revoked_at: string | null;
}

interface AccessLinkTouchResultRow {
  id: string;
}

function isAccessLinkType(value: unknown): value is AccessLinkType {
  return typeof value === "string" && (ACCESS_LINK_TYPES as readonly string[]).includes(value);
}

function isNullableTimestamptzString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isValidTimestamptz(value));
}

/**
 * Runtime shape hardening (mirrors the Task 025 repository pattern) — a
 * TypeScript cast alone is never trusted for a privileged, RLS-bypassing
 * query result.
 */
function isAccessLinkResolutionRow(row: unknown): row is AccessLinkResolutionRpcRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    isValidUuid(candidate.id) &&
    typeof candidate.project_id === "string" &&
    isValidUuid(candidate.project_id) &&
    isAccessLinkType(candidate.link_type) &&
    isNullableTimestamptzString(candidate.expires_at) &&
    isNullableTimestamptzString(candidate.revoked_at)
  );
}

/**
 * Runtime shape hardening for the last_used_at bookkeeping write — a bare
 * Supabase `error === null` is not proof that exactly one row was updated
 * (see touchLastUsedAt below), so the returned representation is validated
 * the same way a privileged read result is.
 */
function isAccessLinkTouchResultRow(row: unknown): row is AccessLinkTouchResultRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return typeof candidate.id === "string" && isValidUuid(candidate.id);
}

/**
 * Pure, testable repository core — takes any Supabase-client-shaped object,
 * so unit tests can mock the client at this narrow boundary without a real
 * network call or a real `SUPABASE_SERVICE_ROLE_KEY`.
 */
export function createAccessLinkResolutionRepository(
  client: SupabaseClient,
): AccessLinkResolutionRepository {
  return {
    async lookupByTokenHash(tokenHash: Uint8Array): Promise<ResolvedAccessLinkRow | null> {
      const { data, error } = await client
        .from("project_access_links")
        .select(ACCESS_LINK_RESOLUTION_COLUMNS)
        .eq("token_hash", toPostgresByteaHexLiteral(tokenHash))
        .maybeSingle();

      if (error) {
        throw new Error("Failed to resolve access link");
      }

      if (!data) {
        return null;
      }

      if (!isAccessLinkResolutionRow(data)) {
        throw new Error("Failed to resolve access link");
      }

      return {
        id: data.id,
        projectId: data.project_id,
        linkType: data.link_type,
        expiresAt: data.expires_at,
        revokedAt: data.revoked_at,
      };
    },

    async touchLastUsedAt(accessLinkId: string): Promise<void> {
      // .select("id").single() forces PostgREST to enforce exactly-one-row
      // cardinality server-side (Accept: application/vnd.pgrst.object+json):
      // a zero-row or multi-row match comes back as a non-2xx `error`, never
      // a silent `{ error: null }` on top of zero rows actually updated.
      const { data, error } = await client
        .from("project_access_links")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", accessLinkId)
        .select("id")
        .single();

      if (error) {
        throw new Error("Failed to record access link usage");
      }

      if (!isAccessLinkTouchResultRow(data) || data.id !== accessLinkId) {
        throw new Error("Failed to record access link usage");
      }
    },
  };
}

/**
 * Production wiring: creates a fresh `service_role` client per call (no
 * top-level/module-scope client, no cached secret) and hands it to the pure
 * repository above. Nothing in this Phase 2 checkpoint calls this function
 * yet (no HTTP route exists) — it exists for the later workflow phases
 * (027/030/032) that will actually consume token resolution.
 */
export function getServiceRoleAccessLinkResolutionRepository(): AccessLinkResolutionRepository {
  return createAccessLinkResolutionRepository(createServiceRoleSupabaseClient());
}
