import type { SupabaseClient } from "@supabase/supabase-js";

import { INVITATION_VARIANTS, PROJECT_STATUSES, type InvitationVariant, type ProjectStatus } from "../../domain";
import type { InvitationPublishGateway } from "../invitation-publish/invitation-publish-gateway";
import type { PublishedInvitationVersion, PublishedVersionSummary } from "../invitation-publish/invitation-publish-types";
import { mapPublishRpcError } from "../invitation-publish/publish-rpc-error-codes";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Production InvitationPublishGateway (Task 031). Always invoked with the
 * staff-scoped client (anon key + caller JWT) — never an elevated key.
 * The only write is the audited `publish_invitation` RPC (migration 0038);
 * reads are DIRECT RLS SELECTs. No generic `.rpc()` passthrough, no table
 * writes, no payload read. Every row is shape-checked at runtime.
 */
const PUBLISHED_COLUMNS =
  "id, invitation_id, project_id, version_number, version_type, source_review_version_id, template_version_id, renderer_key_snapshot, published_at";

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && isValidUuid(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && isValidTimestamptz(value);
}

function isVariant(value: unknown): value is InvitationVariant {
  return typeof value === "string" && (INVITATION_VARIANTS as readonly string[]).includes(value);
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRendererKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function toPublishedSummary(row: unknown): PublishedVersionSummary {
  if (
    !isRecord(row) ||
    !isUuid(row.id) ||
    !isUuid(row.invitation_id) ||
    !isUuid(row.project_id) ||
    !isPositiveInteger(row.version_number) ||
    row.version_type !== "PUBLISHED" ||
    !isUuid(row.source_review_version_id) ||
    !isUuid(row.template_version_id) ||
    !isRendererKey(row.renderer_key_snapshot) ||
    !isTimestamp(row.published_at)
  ) {
    fail();
  }
  return {
    id: row.id,
    invitationId: row.invitation_id,
    projectId: row.project_id,
    versionNumber: row.version_number,
    sourceReviewVersionId: row.source_review_version_id,
    templateVersionId: row.template_version_id,
    rendererKeySnapshot: row.renderer_key_snapshot,
    publishedAt: row.published_at,
  };
}

function toPublished(row: unknown): PublishedInvitationVersion {
  if (
    !isRecord(row) ||
    !isUuid(row.id) ||
    !isUuid(row.invitation_id) ||
    !isUuid(row.project_id) ||
    !isVariant(row.variant) ||
    !isPositiveInteger(row.version_number) ||
    !isUuid(row.source_review_version_id) ||
    !isUuid(row.template_version_id) ||
    !isRendererKey(row.renderer_key_snapshot) ||
    !isTimestamp(row.published_at) ||
    !(row.previous_published_version_id === null || isUuid(row.previous_published_version_id)) ||
    !isProjectStatus(row.project_status)
  ) {
    fail();
  }
  return {
    id: row.id,
    invitationId: row.invitation_id,
    projectId: row.project_id,
    variant: row.variant,
    versionNumber: row.version_number,
    sourceReviewVersionId: row.source_review_version_id,
    templateVersionId: row.template_version_id,
    rendererKeySnapshot: row.renderer_key_snapshot,
    publishedAt: row.published_at,
    previousPublishedVersionId: row.previous_published_version_id,
    projectStatus: row.project_status,
  };
}

export const supabaseInvitationPublishGateway: InvitationPublishGateway<SupabaseClient> = {
  async publishInvitation(client, params) {
    const { data, error } = await client.rpc("publish_invitation", {
      p_project_id: params.projectId,
      p_variant: params.variant,
      p_expected_current_review_version_id: params.expectedCurrentReviewVersionId,
      p_expected_published_version_id: params.expectedPublishedVersionId,
    });

    if (error) {
      mapPublishRpcError(error.code);
    }
    if (!Array.isArray(data) || data.length !== 1) {
      fail();
    }
    return toPublished(data[0]);
  },

  async listPublishedVersionsByIds(client, projectId, versionIds) {
    const { data, error } = await client
      .from("invitation_versions")
      .select(PUBLISHED_COLUMNS)
      .eq("project_id", projectId)
      .eq("version_type", "PUBLISHED")
      .in("id", [...versionIds]);

    if (error) {
      throw new Error("Failed to query published versions");
    }
    if (!Array.isArray(data)) {
      fail();
    }
    return data.map(toPublishedSummary);
  },
};
