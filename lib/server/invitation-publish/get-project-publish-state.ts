import type { PaymentStatus, ProjectStatus } from "../../domain";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { evaluateProjectReviewState, type ProjectReviewStateDependencies } from "../invitation-review/get-project-review-state";
import type { ProjectInvitationRecord, ProjectReviewState, ReviewVersionSummary } from "../invitation-review/invitation-review-types";
import { isValidUuid } from "../validation/uuid";
import type { InvitationPublishGateway } from "./invitation-publish-gateway";
import type { ProjectPublishState, PublishedVersionSummary, RequiredVariantPublishState } from "./invitation-publish-types";

export interface ProjectPublishStateDependencies<TClient> extends ProjectReviewStateDependencies<TClient> {
  publications: Pick<InvitationPublishGateway<TClient>, "listPublishedVersionsByIds">;
}

const CLOSED_STATUSES: readonly ProjectStatus[] = ["PUBLISHED", "COMPLETED", "ARCHIVED"];

/** Same order as migration 0038 section C: closed → payment → lifecycle. */
export function projectPublishBlocker(status: ProjectStatus, paymentStatus: PaymentStatus): ProjectPublishState["projectBlocker"] {
  if (CLOSED_STATUSES.includes(status)) {
    return "PROJECT_CLOSED";
  }
  if (paymentStatus !== "PAID") {
    return "PAYMENT_NOT_READY";
  }
  if (status !== "READY_TO_PUBLISH") {
    return "LIFECYCLE_NOT_READY";
  }
  return null;
}

/**
 * Pure publish-eligibility read model over the Task 030 review read model:
 * per REQUIRED variant (rows for unrequired variants are ignored), the
 * approved current review, the current publication and the first failing
 * precondition in 0038's order. `allRequiredVariantsPublished` mirrors
 * 0038's aggregate rule: every required publication is sourced from its
 * current review. The RPC stays the authority; this only drives the UI.
 */
export function evaluateProjectPublishState(input: {
  review: ProjectReviewState;
  paymentStatus: PaymentStatus;
  invitations: readonly ProjectInvitationRecord[];
  publishedVersions: readonly PublishedVersionSummary[];
  sourceReviews: readonly ReviewVersionSummary[];
}): ProjectPublishState {
  const { review } = input;
  const projectBlocker = projectPublishBlocker(review.projectStatus, input.paymentStatus);

  const variants: RequiredVariantPublishState[] = review.variants.map((row) => {
    const invitation = input.invitations.find((item) => item.variant === row.variant) ?? null;
    const publishedId = invitation?.publishedVersionId ?? null;
    const published = publishedId === null ? undefined : input.publishedVersions.find((item) => item.id === publishedId);
    if (publishedId !== null && (published === undefined || published.invitationId !== invitation?.id)) {
      throw new Error("Published version could not be loaded for its invitation");
    }
    const current = row.currentReview;
    const upToDate = published !== undefined && current !== null && published.sourceReviewVersionId === current.id;

    let blocker: RequiredVariantPublishState["blocker"] = null;
    if (projectBlocker !== null) {
      blocker = projectBlocker;
    } else if (current === null) {
      blocker = "NO_REVIEW";
    } else if (row.revisionRequested) {
      blocker = "REVISION_REQUESTED";
    } else if (!row.approved || review.reviewOutcome !== "APPROVED") {
      blocker = "NOT_APPROVED";
    } else if (upToDate) {
      blocker = "ALREADY_PUBLISHED";
    }

    const sourceNumber =
      published === undefined
        ? null
        : (input.sourceReviews.find((item) => item.id === published.sourceReviewVersionId)?.versionNumber ?? null);

    return {
      variant: row.variant,
      invitationId: row.invitationId,
      currentReview:
        current === null
          ? null
          : { id: current.id, versionNumber: current.versionNumber, createdAt: current.createdAt, approvalState: current.approvalState },
      publishedVersion: published === undefined ? null : { ...published, sourceReviewVersionNumber: sourceNumber },
      upToDate,
      canPublish: blocker === null,
      blocker,
    };
  });

  return {
    projectId: review.projectId,
    projectStatus: review.projectStatus,
    paymentStatus: input.paymentStatus,
    packageCode: review.packageCode,
    requiredVariants: review.requiredVariants,
    projectBlocker,
    variants,
    allRequiredVariantsPublished: variants.length > 0 && variants.every((row) => row.upToDate),
  };
}

/**
 * Staff read model for the Xuất bản tab. DIRECT RLS reads only; writes
 * nothing. Load failures propagate — never turned into an empty state.
 */
export async function getProjectPublishState<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  deps: ProjectPublishStateDependencies<TClient>,
): Promise<ProjectPublishState> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const client = staff.supabase;

  const project = await deps.projects.getProjectById(client, rawProjectId);
  if (project === null) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const invitations = await deps.reviews.listProjectInvitations(client, rawProjectId);
  if (invitations.some((row) => row.projectId !== rawProjectId)) {
    throw new Error("Loaded invitation belongs to a different Project");
  }
  const currentIds = invitations.flatMap((row) => (row.currentReviewVersionId === null ? [] : [row.currentReviewVersionId]));
  const publishedIds = invitations.flatMap((row) => (row.publishedVersionId === null ? [] : [row.publishedVersionId]));

  const publishedVersions =
    publishedIds.length === 0 ? [] : await deps.publications.listPublishedVersionsByIds(client, rawProjectId, publishedIds);
  const reviewIds = [...new Set([...currentIds, ...publishedVersions.map((row) => row.sourceReviewVersionId)])];

  const [reviewVersions, feedback] =
    reviewIds.length === 0
      ? [[], []]
      : await Promise.all([
          deps.reviews.listReviewVersionsByIds(client, rawProjectId, reviewIds),
          currentIds.length === 0 ? Promise.resolve([]) : deps.reviews.listFeedbackForVersions(client, rawProjectId, currentIds),
        ]);

  const review = evaluateProjectReviewState({
    projectId: rawProjectId,
    projectStatus: project.status,
    packageCode: project.packageCodeSnapshot,
    invitations,
    currentReviews: reviewVersions,
    feedback,
  });

  return evaluateProjectPublishState({
    review,
    paymentStatus: project.paymentStatus,
    invitations,
    publishedVersions,
    sourceReviews: reviewVersions,
  });
}
