import {
  deriveReviewOutcome,
  requiredInvitationVariantsForPackage,
  reviewVersionStateOf,
  type ProjectStatus,
} from "../../domain";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import type { ProjectGateway } from "../projects/project-gateway";
import { isValidUuid } from "../validation/uuid";
import type { InvitationReviewGateway } from "./invitation-review-gateway";
import type {
  ProjectInvitationRecord,
  ProjectReviewState,
  RequiredVariantReviewState,
  ReviewFeedbackSummary,
  ReviewVersionSummary,
} from "./invitation-review-types";

export interface ProjectReviewStateDependencies<TClient> {
  projects: Pick<ProjectGateway<TClient>, "getProjectById">;
  reviews: Pick<InvitationReviewGateway<TClient>, "listProjectInvitations" | "listReviewVersionsByIds" | "listFeedbackForVersions">;
}

/**
 * Pure, variant-aware evaluation (docs/PHYSICAL_DATABASE_PLAN.md §2.18
 * [R-Q2]): a required variant is approved only when ITS OWN current
 * review version carries an APPROVAL row. Feedback on any other version
 * (an older review, another variant) never counts, so approving COMMON
 * never approves GROOM/BRIDE and approving review N never approves N+1.
 * Unknown package policy → nothing is required-approved (fail closed).
 * Invitation rows for variants the policy does not require are ignored.
 * `reviewOutcome` applies the Task 030B owner precedence, mirroring
 * migration 0037's `review_outcome_for_project()`.
 */
export function evaluateProjectReviewState(input: {
  projectId: string;
  projectStatus: ProjectStatus;
  packageCode: string;
  invitations: readonly ProjectInvitationRecord[];
  currentReviews: readonly ReviewVersionSummary[];
  feedback: readonly ReviewFeedbackSummary[];
}): ProjectReviewState {
  const required = requiredInvitationVariantsForPackage(input.packageCode);
  if (required === null) {
    return {
      projectId: input.projectId,
      projectStatus: input.projectStatus,
      packageCode: input.packageCode,
      requiredVariants: null,
      variants: [],
      allRequiredVariantsApproved: false,
      reviewOutcome: null,
    };
  }

  const variants: RequiredVariantReviewState[] = required.map((variant) => {
    const invitation = input.invitations.find((row) => row.variant === variant) ?? null;
    const currentId = invitation?.currentReviewVersionId ?? null;
    const review = currentId === null ? undefined : input.currentReviews.find((row) => row.id === currentId);
    if (currentId !== null && (review === undefined || review.invitationId !== invitation?.id)) {
      throw new Error("Current review version could not be loaded for its invitation");
    }
    if (review === undefined) {
      return {
        variant,
        invitationId: invitation?.id ?? null,
        currentReview: null,
        approved: false,
        revisionRequested: false,
      };
    }
    const own = input.feedback.filter((row) => row.invitationVersionId === review.id);
    const approvalState = reviewVersionStateOf(own.map((row) => row.feedbackType));
    return {
      variant,
      invitationId: invitation?.id ?? null,
      currentReview: { ...review, approvalState, feedbackCount: own.length, feedback: own },
      approved: approvalState === "APPROVED",
      revisionRequested: approvalState === "REVISION_REQUESTED",
    };
  });

  const anyReview = variants.some((row) => row.currentReview !== null);
  return {
    projectId: input.projectId,
    projectStatus: input.projectStatus,
    packageCode: input.packageCode,
    requiredVariants: [...required],
    variants,
    allRequiredVariantsApproved: variants.length > 0 && variants.every((row) => row.approved),
    reviewOutcome: anyReview ? deriveReviewOutcome(variants.map((row) => row.currentReview?.approvalState ?? null)) : null,
  };
}

/**
 * Staff read model (Task 030; consumed later by Task 031 publish
 * eligibility): the Project's required variants, each with its current
 * REVIEW version and approval state. DIRECT RLS reads only; writes nothing.
 * Load failures propagate — never turned into an empty review state.
 */
export async function getProjectReviewState<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  deps: ProjectReviewStateDependencies<TClient>,
): Promise<ProjectReviewState> {
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

  const [currentReviews, feedback] =
    currentIds.length === 0
      ? [[], []]
      : await Promise.all([
          deps.reviews.listReviewVersionsByIds(client, rawProjectId, currentIds),
          deps.reviews.listFeedbackForVersions(client, rawProjectId, currentIds),
        ]);

  return evaluateProjectReviewState({
    projectId: rawProjectId,
    projectStatus: project.status,
    packageCode: project.packageCodeSnapshot,
    invitations,
    currentReviews,
    feedback,
  });
}
