import type { SupabaseClient } from "@supabase/supabase-js";

import { INVITATION_VARIANTS, isWellFormedInvitationPublicAlias, type InvitationVariant } from "../../domain";
import { mapInvitationAliasRpcError } from "../invitation-alias/invitation-alias-rpc-error-codes";
import type {
  AssignedInvitationAliasRecord,
  InvitationAliasGateway,
  InvitationPublicLinkRecord,
  PublishedSnapshotRecord,
} from "../invitation-alias/invitation-alias-types";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Production InvitationAliasGateway (LAUNCH-P0-02). Always the staff-scoped
 * client (anon key + caller JWT), never an elevated key. The only write is
 * the `assign_invitation_public_alias` RPC (0049); reads are direct RLS
 * SELECTs. Every row is shape-checked; no database detail is surfaced.
 */

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && isValidUuid(value);
}

function isVariant(value: unknown): value is InvitationVariant {
  return typeof value === "string" && (INVITATION_VARIANTS as readonly string[]).includes(value);
}

function isAlias(value: unknown): value is string {
  return typeof value === "string" && isWellFormedInvitationPublicAlias(value);
}

function toAssigned(row: unknown): AssignedInvitationAliasRecord {
  if (
    !isRecord(row) ||
    !isUuid(row.invitation_id) ||
    !isUuid(row.project_id) ||
    !isVariant(row.variant) ||
    !isAlias(row.alias) ||
    typeof row.created_at !== "string" ||
    !isValidTimestamptz(row.created_at)
  ) {
    fail();
  }
  return { invitationId: row.invitation_id, projectId: row.project_id, variant: row.variant, alias: row.alias, createdAt: row.created_at };
}

export function toInvitationPublicLinks(invitations: unknown, aliases: unknown, projectId: string): InvitationPublicLinkRecord[] {
  if (!Array.isArray(invitations) || !Array.isArray(aliases)) fail();
  const byInvitation = new Map<string, string>();
  for (const row of aliases) {
    if (!isRecord(row) || !isUuid(row.invitation_id) || row.project_id !== projectId || !isAlias(row.alias)) fail();
    byInvitation.set(row.invitation_id, row.alias);
  }
  const links = invitations.map((row: unknown): InvitationPublicLinkRecord => {
    if (!isRecord(row) || !isUuid(row.id) || row.project_id !== projectId || !isVariant(row.variant) || typeof row.public_slug !== "string" || row.public_slug.length === 0) {
      fail();
    }
    return { invitationId: row.id, variant: row.variant, publicSlug: row.public_slug, alias: byInvitation.get(row.id) ?? null };
  });
  // An alias row must belong to one of this Project's invitations.
  if ([...byInvitation.keys()].some((id) => !links.some((link) => link.invitationId === id))) fail();
  return links;
}

export const supabaseInvitationAliasGateway: InvitationAliasGateway<SupabaseClient> = {
  async assignAlias(client, params) {
    const { data, error } = await client.rpc("assign_invitation_public_alias", {
      p_project_id: params.projectId,
      p_variant: params.variant,
      p_alias: params.alias,
    });
    if (error) {
      mapInvitationAliasRpcError(error.code, params.alias);
    }
    if (!Array.isArray(data) || data.length !== 1) fail();
    return toAssigned(data[0]);
  },

  async getPublishedSnapshot(client, projectId, variant): Promise<PublishedSnapshotRecord | null> {
    const invitation = await client
      .from("project_invitations")
      .select("id, project_id, published_version_id")
      .eq("project_id", projectId)
      .eq("variant", variant)
      .maybeSingle();
    if (invitation.error) throw new Error("Failed to query invitation");
    if (invitation.data === null || invitation.data.published_version_id === null) return null;
    if (!isUuid(invitation.data.id) || !isUuid(invitation.data.published_version_id)) fail();

    const version = await client
      .from("invitation_versions")
      .select("id, invitation_id, project_id, version_type, template_version_id, renderer_key_snapshot, payload")
      .eq("id", invitation.data.published_version_id)
      .maybeSingle();
    if (version.error) throw new Error("Failed to query published version");
    const v: unknown = version.data;
    if (
      !isRecord(v) ||
      v.version_type !== "PUBLISHED" ||
      v.invitation_id !== invitation.data.id ||
      v.project_id !== projectId ||
      !isUuid(v.template_version_id) ||
      typeof v.renderer_key_snapshot !== "string" ||
      v.renderer_key_snapshot.length === 0
    ) {
      throw new Error("Published version pointer integrity fault");
    }
    return { invitationId: invitation.data.id, templateVersionId: v.template_version_id, rendererKey: v.renderer_key_snapshot, payload: v.payload };
  },

  async listPublicLinks(client, projectId) {
    const [invitations, aliases] = await Promise.all([
      client.from("project_invitations").select("id, project_id, variant, public_slug").eq("project_id", projectId),
      client.from("invitation_public_aliases").select("invitation_id, project_id, alias").eq("project_id", projectId),
    ]);
    if (invitations.error || aliases.error) throw new Error("Failed to query invitation public links");
    return toInvitationPublicLinks(invitations.data, aliases.data, projectId);
  },
};
