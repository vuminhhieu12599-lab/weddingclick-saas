import type { SupabaseClient } from "@supabase/supabase-js";

import { INVITATION_VARIANTS, REVIEW_FEEDBACK_TYPES, type InvitationVariant, type ReviewFeedbackType } from "../../domain";
import { ApiError } from "../errors/api-error";
import type { InvitationReviewGateway } from "../invitation-review/invitation-review-gateway";
import type {
  CreatedReviewVersion,
  ProjectInvitationRecord,
  ReviewFeedbackSummary,
  ReviewVersionSummary,
} from "../invitation-review/invitation-review-types";
import { REVIEW_RPC_ERROR_CODES } from "../invitation-review/review-rpc-error-codes";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";

/**
 * Production InvitationReviewGateway (Task 030). Always invoked with the
 * staff-scoped client (anon key + caller JWT) — never `service_role`.
 * Reads are DIRECT RLS SELECTs; the only write is the audited
 * `create_review_version` RPC (migration 0036). No generic `.rpc()`
 * passthrough, no UPDATE/DELETE of versions, no PUBLISHED access path for
 * writes. Every row is shape-checked at runtime; a cast is never trusted.
 */
const INVITATION_COLUMNS = "id, project_id, variant, current_review_version_id, published_version_id";
const VERSION_COLUMNS = "id, invitation_id, project_id, version_number, version_type, template_version_id, renderer_key_snapshot, created_at";
const FEEDBACK_COLUMNS = "id, invitation_version_id, feedback_type, message, created_at";

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && isValidUuid(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && isValidTimestamptz(value);
}

function isVariant(value: unknown): value is InvitationVariant {
  return typeof value === "string" && (INVITATION_VARIANTS as readonly string[]).includes(value);
}

function isFeedbackType(value: unknown): value is ReviewFeedbackType {
  return typeof value === "string" && (REVIEW_FEEDBACK_TYPES as readonly string[]).includes(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function toInvitation(row: unknown): ProjectInvitationRecord {
  if (
    !isRecord(row) ||
    !isUuid(row.id) ||
    !isUuid(row.project_id) ||
    !isVariant(row.variant) ||
    !isNullableUuid(row.current_review_version_id) ||
    !isNullableUuid(row.published_version_id)
  ) {
    fail();
  }
  return {
    id: row.id,
    projectId: row.project_id,
    variant: row.variant,
    currentReviewVersionId: row.current_review_version_id,
    publishedVersionId: row.published_version_id,
  };
}

function toReviewVersion(row: unknown): ReviewVersionSummary {
  if (
    !isRecord(row) ||
    !isUuid(row.id) ||
    !isUuid(row.invitation_id) ||
    !isUuid(row.project_id) ||
    !isPositiveInteger(row.version_number) ||
    row.version_type !== "REVIEW" ||
    !isUuid(row.template_version_id) ||
    typeof row.renderer_key_snapshot !== "string" ||
    row.renderer_key_snapshot.length === 0 ||
    !isTimestamp(row.created_at)
  ) {
    fail();
  }
  return {
    id: row.id,
    invitationId: row.invitation_id,
    projectId: row.project_id,
    versionNumber: row.version_number,
    templateVersionId: row.template_version_id,
    rendererKeySnapshot: row.renderer_key_snapshot,
    createdAt: row.created_at,
  };
}

function toFeedback(row: unknown): ReviewFeedbackSummary {
  if (
    !isRecord(row) ||
    !isUuid(row.id) ||
    !isUuid(row.invitation_version_id) ||
    !isFeedbackType(row.feedback_type) ||
    !(row.message === null || typeof row.message === "string") ||
    !isTimestamp(row.created_at)
  ) {
    fail();
  }
  return {
    id: row.id,
    invitationVersionId: row.invitation_version_id,
    feedbackType: row.feedback_type,
    message: row.message,
    createdAt: row.created_at,
  };
}

function toCreated(row: unknown): CreatedReviewVersion {
  if (
    !isRecord(row) ||
    !isUuid(row.id) ||
    !isUuid(row.invitation_id) ||
    !isUuid(row.project_id) ||
    !isVariant(row.variant) ||
    !isPositiveInteger(row.version_number) ||
    !isUuid(row.template_version_id) ||
    typeof row.renderer_key_snapshot !== "string" ||
    !isTimestamp(row.created_at)
  ) {
    fail();
  }
  return {
    id: row.id,
    invitationId: row.invitation_id,
    projectId: row.project_id,
    variant: row.variant,
    versionNumber: row.version_number,
    templateVersionId: row.template_version_id,
    rendererKeySnapshot: row.renderer_key_snapshot,
    createdAt: row.created_at,
  };
}

export const supabaseInvitationReviewGateway: InvitationReviewGateway<SupabaseClient> = {
  async createReviewVersion(client, params) {
    const { data, error } = await client.rpc("create_review_version", {
      p_project_id: params.projectId,
      p_variant: params.variant,
      p_expected_current_review_version_id: params.expectedCurrentReviewVersionId,
      p_template_version_id: params.templateVersionId,
      p_renderer_key: params.rendererKey,
      p_payload: params.payload,
      p_media_ids: [...params.mediaIds],
    });

    if (error) {
      const known = REVIEW_RPC_ERROR_CODES[error.code];
      if (known) {
        throw new ApiError(known.kind, known.message);
      }
      throw new Error("Failed to create review version");
    }
    if (!Array.isArray(data) || data.length !== 1) {
      fail();
    }
    const created = toCreated(data[0]);
    if (created.templateVersionId !== params.templateVersionId || created.rendererKeySnapshot !== params.rendererKey) {
      fail();
    }
    return created;
  },

  async listProjectInvitations(client, projectId) {
    const { data, error } = await client
      .from("project_invitations")
      .select(INVITATION_COLUMNS)
      .eq("project_id", projectId)
      .order("variant", { ascending: true });

    if (error) {
      throw new Error("Failed to query project invitations");
    }
    if (!Array.isArray(data)) {
      fail();
    }
    return data.map(toInvitation);
  },

  async listReviewVersionsByIds(client, projectId, versionIds) {
    const { data, error } = await client
      .from("invitation_versions")
      .select(VERSION_COLUMNS)
      .eq("project_id", projectId)
      .eq("version_type", "REVIEW")
      .in("id", [...versionIds]);

    if (error) {
      throw new Error("Failed to query review versions");
    }
    if (!Array.isArray(data)) {
      fail();
    }
    return data.map(toReviewVersion);
  },

  async listFeedbackForVersions(client, projectId, versionIds) {
    const { data, error } = await client
      .from("review_feedback")
      .select(FEEDBACK_COLUMNS)
      .eq("project_id", projectId)
      .in("invitation_version_id", [...versionIds])
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error("Failed to query review feedback");
    }
    if (!Array.isArray(data)) {
      fail();
    }
    return data.map(toFeedback);
  },

  async getReviewVersionWithPayload(client, projectId, versionId) {
    const { data, error } = await client
      .from("invitation_versions")
      .select(`${VERSION_COLUMNS}, payload`)
      .eq("id", versionId)
      .eq("project_id", projectId)
      .eq("version_type", "REVIEW")
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query review version");
    }
    if (data === null) {
      return null;
    }
    const version = toReviewVersion(data);

    const { data: invitation, error: invitationError } = await client
      .from("project_invitations")
      .select(INVITATION_COLUMNS)
      .eq("id", version.invitationId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (invitationError) {
      throw new Error("Failed to query project invitation");
    }
    if (invitation === null) {
      fail();
    }
    return { ...version, variant: toInvitation(invitation).variant, payload: (data as Record<string, unknown>).payload };
  },
};
