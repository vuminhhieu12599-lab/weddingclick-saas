import { INVITATION_VARIANTS, PROJECT_STATUSES, REVIEW_FEEDBACK_TYPES, type InvitationVariant, type ProjectStatus, type ReviewFeedbackType } from "../../domain";
import type { CustomerReviewGateway } from "../customer-review/customer-review-gateway";
import { mapCustomerReviewRpcError } from "../customer-review/customer-review-rpc-error-codes";
import type {
  CustomerReviewFeedbackItem,
  CustomerReviewRecord,
  CustomerReviewVersionRecord,
  PinnedReviewMedia,
} from "../customer-review/customer-review-types";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Production, service_role-backed CustomerReviewGateway (Task 030B, Path B).
 * Exposes exactly two capabilities — the `get_customer_review` and
 * `submit_review_feedback` RPCs of migration 0037 — called only with an
 * access-link context the Task 026 resolver already validated. Both RPCs
 * re-validate that context themselves. No table access (`.from`), no
 * Storage access, no generic `.rpc()` passthrough, never a raw token.
 * Deliberately isolated from access-link-resolution-repository.ts and from
 * the media signer. A fresh client per call; nothing cached at module scope.
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

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && isValidTimestamptz(value);
}

function isDimension(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function toMedia(value: unknown): PinnedReviewMedia {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    typeof value.storageBucket !== "string" ||
    typeof value.storagePath !== "string" ||
    value.storagePath.length === 0 ||
    !isDimension(value.width) ||
    !isDimension(value.height)
  ) {
    fail();
  }
  return { id: value.id, storageBucket: value.storageBucket, storagePath: value.storagePath, width: value.width, height: value.height };
}

function toFeedback(value: unknown): CustomerReviewFeedbackItem {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isOneOf<ReviewFeedbackType>(REVIEW_FEEDBACK_TYPES, value.feedbackType) ||
    !(value.message === null || typeof value.message === "string") ||
    !isTimestamp(value.createdAt)
  ) {
    fail();
  }
  return { id: value.id, feedbackType: value.feedbackType, message: value.message, createdAt: value.createdAt };
}

function toVersion(value: unknown): CustomerReviewVersionRecord {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isUuid(value.invitationId) ||
    typeof value.versionNumber !== "number" ||
    !Number.isInteger(value.versionNumber) ||
    value.versionNumber < 1 ||
    !isUuid(value.templateVersionId) ||
    typeof value.rendererKey !== "string" ||
    value.rendererKey.length === 0 ||
    !isTimestamp(value.createdAt) ||
    !Array.isArray(value.media) ||
    !Array.isArray(value.feedback)
  ) {
    fail();
  }
  return {
    id: value.id,
    invitationId: value.invitationId,
    versionNumber: value.versionNumber,
    templateVersionId: value.templateVersionId,
    rendererKey: value.rendererKey,
    createdAt: value.createdAt,
    payload: value.payload,
    media: value.media.map(toMedia),
    feedback: value.feedback.map(toFeedback),
  };
}

export function toCustomerReviewRecord(data: unknown): CustomerReviewRecord {
  if (
    !isRecord(data) ||
    !isUuid(data.projectId) ||
    !isOneOf<ProjectStatus>(PROJECT_STATUSES, data.projectStatus) ||
    typeof data.hasVariantPolicy !== "boolean" ||
    typeof data.feedbackOpen !== "boolean" ||
    !Array.isArray(data.variants)
  ) {
    fail();
  }
  const variants = data.variants.map((item: unknown) => {
    if (!isRecord(item) || !isOneOf<InvitationVariant>(INVITATION_VARIANTS, item.variant)) {
      fail();
    }
    return { variant: item.variant, review: item.review === null ? null : toVersion(item.review) };
  });
  return {
    projectId: data.projectId,
    projectStatus: data.projectStatus,
    hasVariantPolicy: data.hasVariantPolicy,
    feedbackOpen: data.feedbackOpen,
    variants,
  };
}

export function getServiceRoleCustomerReviewGateway(): CustomerReviewGateway {
  return {
    async getCustomerReview(context) {
      const client = createServiceRoleSupabaseClient();
      const { data, error } = await client.rpc("get_customer_review", {
        p_project_id: context.projectId,
        p_access_link_id: context.accessLinkId,
      });
      if (error) {
        mapCustomerReviewRpcError(error.code, "Failed to load customer review");
      }
      return toCustomerReviewRecord(data);
    },

    async submitReviewFeedback(params) {
      const client = createServiceRoleSupabaseClient();
      const { data, error } = await client.rpc("submit_review_feedback", {
        p_project_id: params.projectId,
        p_access_link_id: params.accessLinkId,
        p_invitation_version_id: params.invitationVersionId,
        p_feedback_type: params.feedbackType,
        p_message: params.message,
      });
      if (error) {
        mapCustomerReviewRpcError(error.code, "Failed to submit review feedback");
      }
      if (!Array.isArray(data) || data.length !== 1) {
        fail();
      }
      const row: unknown = data[0];
      if (
        !isRecord(row) ||
        !isUuid(row.id) ||
        row.project_id !== params.projectId ||
        row.invitation_version_id !== params.invitationVersionId ||
        row.feedback_type !== params.feedbackType ||
        !isTimestamp(row.created_at) ||
        !isOneOf<ProjectStatus>(PROJECT_STATUSES, row.project_status)
      ) {
        fail();
      }
      return {
        id: row.id,
        invitationVersionId: params.invitationVersionId,
        feedbackType: params.feedbackType,
        createdAt: row.created_at,
        projectStatus: row.project_status,
      };
    },
  };
}
