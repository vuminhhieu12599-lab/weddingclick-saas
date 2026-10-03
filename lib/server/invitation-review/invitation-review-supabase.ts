import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseStaffInvitationPreviewDependencies } from "../invitation-preview/staff-invitation-preview-supabase";
import { supabaseInvitationReviewGateway } from "../supabase/invitation-review-repository";
import type { ReviewVersionPreviewDependencies } from "./build-review-version-preview";
import type { CreateReviewVersionDependencies } from "./create-review-version";
import type { ProjectReviewStateDependencies } from "./get-project-review-state";

/**
 * Production wiring for the Task 030 staff review use cases: the existing
 * staff-scoped preview pipeline plus the review gateway. Every call
 * receives the StaffContext's own JWT-scoped client; no elevated credential.
 */
export const supabaseCreateReviewVersionDependencies: CreateReviewVersionDependencies<SupabaseClient> = {
  ...supabaseStaffInvitationPreviewDependencies,
  reviews: supabaseInvitationReviewGateway,
};

export const supabaseProjectReviewStateDependencies: ProjectReviewStateDependencies<SupabaseClient> = {
  projects: supabaseStaffInvitationPreviewDependencies.projects,
  reviews: supabaseInvitationReviewGateway,
};

export const supabaseReviewVersionPreviewDependencies: ReviewVersionPreviewDependencies<SupabaseClient> = {
  createMediaResolver: supabaseStaffInvitationPreviewDependencies.createMediaResolver,
  rendererRegistry: supabaseStaffInvitationPreviewDependencies.rendererRegistry,
  reviews: supabaseInvitationReviewGateway,
};
