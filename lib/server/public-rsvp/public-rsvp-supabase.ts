import { getServiceRolePublicGuestRsvpGateway } from "../supabase/public-guest-repository";
import { getServiceRolePublicRsvpGateway } from "../supabase/public-rsvp-repository";
import type { SubmitPublicRsvpDependencies } from "./submit-public-rsvp";

/**
 * Production wiring for POST /api/v2/public/rsvp (Task 033A). Built per
 * request (no module-scope client or secret). Imported only by that route.
 * Task 033B1 adds the personalized (guest-token) RSVP gateway.
 */
export function createPublicRsvpDependencies(): SubmitPublicRsvpDependencies {
  return { rsvps: getServiceRolePublicRsvpGateway(), guestRsvps: getServiceRolePublicGuestRsvpGateway() };
}
