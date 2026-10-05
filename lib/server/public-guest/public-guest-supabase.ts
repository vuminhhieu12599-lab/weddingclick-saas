import { createPublicInvitationPageDependencies } from "../public-invitation/public-invitation-supabase";
import { getServiceRolePublicGuestGateway } from "../supabase/public-guest-repository";
import type { LoadPersonalizedPublicInvitationDependencies } from "./load-personalized-public-invitation";

/**
 * Production wiring for the Task 033B1 personalized page /i/[slug]/g/[token].
 * Built per request (no module-scope client or secret): the unchanged Task
 * 032A page dependencies plus the 0042 guest resolver. Imported only by
 * app/i/[slug]/g/[token]/page.tsx.
 */
export function createPersonalizedPublicInvitationPageDependencies(): LoadPersonalizedPublicInvitationDependencies {
  return { ...createPublicInvitationPageDependencies(), guests: getServiceRolePublicGuestGateway() };
}
