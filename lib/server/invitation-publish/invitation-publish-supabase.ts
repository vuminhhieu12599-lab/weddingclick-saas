import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseProjectReviewStateDependencies } from "../invitation-review/invitation-review-supabase";
import { supabaseInvitationPublishGateway } from "../supabase/invitation-publish-repository";
import type { ProjectPublishStateDependencies } from "./get-project-publish-state";
import type { PublishInvitationDependencies } from "./publish-invitation";

/**
 * Production wiring for the Task 031 staff publish use cases. Every call
 * receives the StaffContext's own JWT-scoped client; no elevated credential.
 */
export const supabasePublishInvitationDependencies: PublishInvitationDependencies<SupabaseClient> = {
  publications: supabaseInvitationPublishGateway,
};

export const supabaseProjectPublishStateDependencies: ProjectPublishStateDependencies<SupabaseClient> = {
  ...supabaseProjectReviewStateDependencies,
  publications: supabaseInvitationPublishGateway,
};
