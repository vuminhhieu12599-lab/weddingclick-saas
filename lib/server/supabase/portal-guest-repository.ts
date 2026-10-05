import { INVITATION_VARIANTS, SERVICE_ADDON_CODES, type InvitationVariant } from "../../domain";
import type { PortalGuestGateway, PortalGuestLinkGateway, PortalGuestRecord, PortalGuestState } from "../customer-portal/portal-guest-types";
import { isValidUuid } from "../validation/uuid";
import { toPostgresByteaHexLiteral } from "./postgres-bytea";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Production, service_role-backed PortalGuestGateway (Task 033E-A). Called
 * only after PORTAL token resolution; every statement is filtered by that
 * resolved `projectId` (never browser input) and, for one guest, also by
 * its id. Uses the existing 0017 service_role grants on `guests` (the
 * Customer PORTAL Guest Tool) and the 0005/0006/0012/0013 SELECT grants —
 * no migration, no `.rpc()`, no DELETE, no `rsvps` access.
 *
 * Writes are single conditional statements (the 033B1 `replaceGuestToken`
 * style): edit requires `revoked_at IS NULL` and, for a side, also
 * `token_issued_at IS NULL OR invitation_variant = <side>`; revoke requires
 * `revoked_at IS NULL`. Explicit columns only: `token_hash` is written once
 * at insert and never selected; `token_hint`, `phone`, `note`, `group_name`
 * are never read or written; `token_issued_at` is reduced to a boolean
 * here. A fresh client per call. Nothing is logged; errors carry no detail.
 * Task 033E-B adds the Project-pinned issuance gateway at the end of this file.
 */

const PERSONALIZED_GUEST_ADDON_CODE = SERVICE_ADDON_CODES[0];
const GUEST_COLUMNS = "id, project_id, display_name, invitation_variant, token_issued_at, revoked_at";

function fail(): never {
  throw new Error("Failed to access portal guests");
}

function isVariant(value: unknown): value is InvitationVariant {
  return typeof value === "string" && (INVITATION_VARIANTS as readonly string[]).includes(value);
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

/** Guards one selected row of `projectId` and reduces it; another Project's row fails closed. */
export function toPortalGuestRecord(row: unknown, projectId: string): PortalGuestRecord {
  if (typeof row !== "object" || row === null) fail();
  const r = row as Record<string, unknown>;
  if (
    !(typeof r.id === "string" && isValidUuid(r.id)) ||
    r.project_id !== projectId ||
    typeof r.display_name !== "string" ||
    !(r.invitation_variant === null || isVariant(r.invitation_variant)) ||
    !isNullableTimestamp(r.token_issued_at) ||
    !isNullableTimestamp(r.revoked_at)
  ) {
    fail();
  }
  return {
    id: r.id,
    displayName: r.display_name,
    invitationVariant: r.invitation_variant,
    linkIssued: r.token_issued_at !== null,
    revoked: r.revoked_at !== null,
  };
}

/** Exactly zero or one row from a conditional write's `.select()`. */
function singleOrNull(data: unknown, projectId: string): PortalGuestRecord | null {
  if (!Array.isArray(data) || data.length > 1) fail();
  return data.length === 0 ? null : toPortalGuestRecord(data[0], projectId);
}

function toGuestState(record: PortalGuestRecord): PortalGuestState {
  return { invitationVariant: record.invitationVariant, linkIssued: record.linkIssued, revoked: record.revoked };
}

export function getServiceRolePortalGuestGateway(): PortalGuestGateway {
  return {
    async getGuestToolContext(projectId) {
      if (!isValidUuid(projectId)) fail();
      const client = createServiceRoleSupabaseClient();

      const project = await client.from("projects").select("package_code_snapshot").eq("id", projectId).maybeSingle();
      if (project.error) fail();
      const packageCode: unknown = project.data === null ? null : project.data.package_code_snapshot;
      if (packageCode !== null && typeof packageCode !== "string") fail();

      const invitations = await client
        .from("project_invitations")
        .select("id, published_version_id")
        .eq("project_id", projectId)
        .not("published_version_id", "is", null);
      if (invitations.error || !Array.isArray(invitations.data)) fail();

      let published = false;
      if (invitations.data.length > 0) {
        const versions = await client
          .from("invitation_versions")
          .select("id, invitation_id, version_type")
          .eq("project_id", projectId)
          .in(
            "id",
            invitations.data.map((row) => row.published_version_id),
          );
        if (versions.error || !Array.isArray(versions.data)) fail();
        published = invitations.data.some((invitation) =>
          versions.data.some(
            (version) => version.id === invitation.published_version_id && version.invitation_id === invitation.id && version.version_type === "PUBLISHED",
          ),
        );
      }

      const addons = await client
        .from("project_addons")
        .select("id")
        .eq("project_id", projectId)
        .eq("addon_code_snapshot", PERSONALIZED_GUEST_ADDON_CODE)
        .is("revoked_at", null)
        .limit(1);
      if (addons.error || !Array.isArray(addons.data)) fail();

      return { packageCode, published, personalizedGuestEntitled: addons.data.length === 1 };
    },

    async listGuests(projectId) {
      if (!isValidUuid(projectId)) fail();
      const client = createServiceRoleSupabaseClient();
      const rows = await client
        .from("guests")
        .select(GUEST_COLUMNS, { count: "exact" })
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (rows.error || !Array.isArray(rows.data)) fail();
      // A server row cap must never silently truncate the couple's list.
      if (rows.count !== rows.data.length) fail();
      return rows.data.map((row: unknown) => toPortalGuestRecord(row, projectId));
    },

    async insertGuest(projectId, params) {
      if (!isValidUuid(projectId) || params.tokenHash.length !== 32) fail();
      const client = createServiceRoleSupabaseClient();
      const inserted = await client
        .from("guests")
        .insert({
          project_id: projectId,
          display_name: params.displayName,
          invitation_variant: params.invitationVariant,
          token_hash: toPostgresByteaHexLiteral(params.tokenHash),
          token_hint: null,
          token_issued_at: null,
          revoked_at: null,
          created_by: null,
        })
        .select(GUEST_COLUMNS);
      if (inserted.error) fail();
      const record = singleOrNull(inserted.data, projectId);
      if (record === null) fail();
      return record;
    },

    async updateGuest(projectId, guestId, params) {
      if (!isValidUuid(projectId) || !isValidUuid(guestId)) fail();
      const client = createServiceRoleSupabaseClient();
      const side = params.invitationVariant;
      const base = client
        .from("guests")
        .update(side === undefined ? { display_name: params.displayName } : { display_name: params.displayName, invitation_variant: side })
        .eq("id", guestId)
        .eq("project_id", projectId)
        .is("revoked_at", null);
      // Side lock after issuance, in the same statement (no read-then-write).
      const guarded = side === undefined ? base : base.or(`token_issued_at.is.null,invitation_variant.eq.${side === "GROOM" ? "GROOM" : "BRIDE"}`);
      const updated = await guarded.select(GUEST_COLUMNS);
      if (updated.error) fail();
      return singleOrNull(updated.data, projectId);
    },

    async revokeGuest(projectId, guestId) {
      if (!isValidUuid(projectId) || !isValidUuid(guestId)) fail();
      const client = createServiceRoleSupabaseClient();
      const revoked = await client
        .from("guests")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", guestId)
        .eq("project_id", projectId)
        .is("revoked_at", null)
        .select(GUEST_COLUMNS);
      if (revoked.error) fail();
      return singleOrNull(revoked.data, projectId);
    },

    async getGuestState(projectId, guestId) {
      if (!isValidUuid(projectId) || !isValidUuid(guestId)) fail();
      const client = createServiceRoleSupabaseClient();
      const row = await client.from("guests").select(GUEST_COLUMNS).eq("id", guestId).eq("project_id", projectId).maybeSingle();
      if (row.error) fail();
      return row.data === null ? null : toGuestState(toPortalGuestRecord(row.data, projectId));
    },
  };
}

/**
 * Task 033E-B — the Portal's Project-pinned implementation of the shared
 * 033B1 `GuestLinkGateway`, used only by `issuePortalGuestLink` after PORTAL
 * resolution. Its "client" is the resolved Project; any call for another
 * Project fails closed. Same reads/writes as the staff gateway, with two
 * Portal-specific rules:
 *   - the slug is returned only while that variant's invitation has a valid
 *     PUBLISHED pointer (a link is never manufactured for an unpublished
 *     side; a pointer integrity fault is a generic failure);
 *   - the rotation is the same single conditional UPDATE (project, id,
 *     active, expected `token_issued_at` state, expected `invitation_variant`).
 * `token_hash` is written, never selected; nothing is logged.
 */
export function getServiceRolePortalGuestLinkGateway(): PortalGuestLinkGateway {
  const pinned = (client: { projectId: string }, projectId: string) => {
    if (!isValidUuid(projectId) || client.projectId !== projectId) fail();
  };

  return {
    async hasPersonalizedGuestEntitlement(client, projectId) {
      pinned(client, projectId);
      const addons = await createServiceRoleSupabaseClient()
        .from("project_addons")
        .select("id")
        .eq("project_id", projectId)
        .eq("addon_code_snapshot", PERSONALIZED_GUEST_ADDON_CODE)
        .is("revoked_at", null)
        .limit(1);
      if (addons.error || !Array.isArray(addons.data)) fail();
      return addons.data.length === 1;
    },

    async getGuestLinkTarget(client, projectId, guestId) {
      pinned(client, projectId);
      if (!isValidUuid(guestId)) return null;
      const supabase = createServiceRoleSupabaseClient();
      const row = await supabase.from("guests").select(GUEST_COLUMNS).eq("id", guestId).eq("project_id", projectId).maybeSingle();
      if (row.error) fail();
      if (row.data === null) return null;
      const record = toPortalGuestRecord(row.data, projectId);

      const project = await supabase.from("projects").select("package_code_snapshot").eq("id", projectId).maybeSingle();
      if (project.error || project.data === null || typeof project.data.package_code_snapshot !== "string") fail();
      return {
        invitationVariant: record.invitationVariant,
        hasIssuedLink: record.linkIssued,
        revoked: record.revoked,
        packageCode: project.data.package_code_snapshot,
      };
    },

    async getInvitationSlug(client, projectId, variant) {
      pinned(client, projectId);
      const supabase = createServiceRoleSupabaseClient();
      const invitation = await supabase
        .from("project_invitations")
        .select("id, public_slug, published_version_id")
        .eq("project_id", projectId)
        .eq("variant", variant)
        .maybeSingle();
      if (invitation.error) fail();
      if (invitation.data === null || invitation.data.published_version_id === null) return null;
      const { id, public_slug: slug, published_version_id: versionId } = invitation.data;
      if (typeof slug !== "string" || slug.length === 0 || typeof versionId !== "string") fail();

      const version = await supabase
        .from("invitation_versions")
        .select("id, invitation_id, project_id, version_type")
        .eq("id", versionId)
        .maybeSingle();
      if (version.error) fail();
      if (
        version.data === null ||
        version.data.invitation_id !== id ||
        version.data.project_id !== projectId ||
        version.data.version_type !== "PUBLISHED"
      ) {
        fail();
      }
      return slug;
    },

    async replaceGuestToken(client, params) {
      pinned(client, params.projectId);
      if (!isValidUuid(params.guestId) || params.tokenHash.length !== 32) fail();
      const base = createServiceRoleSupabaseClient()
        .from("guests")
        .update({
          token_hash: toPostgresByteaHexLiteral(params.tokenHash),
          token_hint: params.tokenHint,
          token_issued_at: new Date().toISOString(),
        })
        .eq("id", params.guestId)
        .eq("project_id", params.projectId)
        .is("revoked_at", null);
      const issuance = params.expectIssued ? base.not("token_issued_at", "is", null) : base.is("token_issued_at", null);
      // 033B1 race fix: the side the slug was resolved from must still be stored.
      const variant = params.expectedInvitationVariant;
      const guarded = variant === null ? issuance.is("invitation_variant", null) : issuance.eq("invitation_variant", variant);
      const updated = await guarded.select("id");
      if (updated.error || !Array.isArray(updated.data) || updated.data.length > 1) fail();
      return updated.data.length === 1;
    },
  };
}
