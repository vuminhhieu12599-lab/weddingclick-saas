import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import {
  composeStaffInvitationRender,
  type StaffInvitationPreviewDependencies,
  type StaffInvitationRender,
} from "../invitation-preview/build-staff-invitation-preview";
import { isValidUuid } from "../validation/uuid";
import { assertStoredReviewSnapshot } from "./assert-stored-review-snapshot";
import type { InvitationReviewGateway } from "./invitation-review-gateway";
import type { ReviewVersionSummary } from "./invitation-review-types";

export interface ReviewVersionPreviewDependencies<TClient>
  extends Pick<StaffInvitationPreviewDependencies<TClient>, "createMediaResolver" | "rendererRegistry"> {
  reviews: Pick<InvitationReviewGateway<TClient>, "getReviewVersionWithPayload">;
}

export interface ReviewVersionPreview extends StaffInvitationRender {
  version: ReviewVersionSummary;
}

/**
 * Staff preview of one persisted, immutable REVIEW version. Renders ONLY
 * from the stored Snapshot and its pinned renderer binding — it never
 * loads or rebuilds the mutable draft, and never falls back to draft
 * preview. The stored payload must agree with its row (schema version,
 * variant, template version, renderer key) before it is rendered; any
 * disagreement is an integrity fault (500), not a degraded render. Media
 * URLs are resolved at runtime with the staff client and never stored.
 */
export async function buildReviewVersionPreview<TClient>(
  rawProjectId: string,
  rawVersionId: string,
  staff: StaffContext<TClient>,
  deps: ReviewVersionPreviewDependencies<TClient>,
): Promise<ReviewVersionPreview> {
  if (!isValidUuid(rawProjectId) || !isValidUuid(rawVersionId)) {
    throw new ApiError("BAD_REQUEST", "Project id and version id must be valid UUIDs");
  }

  const stored = await deps.reviews.getReviewVersionWithPayload(staff.supabase, rawProjectId, rawVersionId);
  if (stored === null) {
    throw new ApiError("NOT_FOUND", "Review version not found");
  }

  if (stored.id !== rawVersionId || stored.projectId !== rawProjectId) {
    throw new Error("Stored review Snapshot is inconsistent with its version row");
  }
  const snapshot = assertStoredReviewSnapshot({
    variant: stored.variant,
    templateVersionId: stored.templateVersionId,
    rendererKey: stored.rendererKeySnapshot,
    payload: stored.payload,
  });
  const render = await composeStaffInvitationRender(snapshot, rawProjectId, staff.supabase, deps);

  const version: ReviewVersionSummary = {
    id: stored.id,
    invitationId: stored.invitationId,
    projectId: stored.projectId,
    versionNumber: stored.versionNumber,
    templateVersionId: stored.templateVersionId,
    rendererKeySnapshot: stored.rendererKeySnapshot,
    createdAt: stored.createdAt,
  };
  return { version, ...render };
}
