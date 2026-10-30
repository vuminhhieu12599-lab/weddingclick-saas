import { getServiceRoleKeyedPublicRsvpGateway } from "../supabase/keyed-public-rsvp-repository";
import { getServiceRolePublicGuestRsvpGateway } from "../supabase/public-guest-repository";
import { getServiceRolePublicRsvpGateway } from "../supabase/public-rsvp-repository";
import type { SubmitPublicRsvpDependencies } from "./submit-public-rsvp";

/**
 * Production wiring for POST /api/v2/public/rsvp (Task 033A). Built per
 * request (no module-scope client or secret). Imported only by that route.
 * Task 033B1 adds the personalized (guest-token) RSVP gateway; RSVP-P0-03
 * adds the keyed generic submit-or-correct gateway (0056). The unkeyed 0040
 * writer stays wired, so a request from an older cached client bundle is
 * still served exactly as before.
 */
export function createPublicRsvpDependencies(): SubmitPublicRsvpDependencies {
  return {
    rsvps: getServiceRolePublicRsvpGateway(),
    guestRsvps: getServiceRolePublicGuestRsvpGateway(),
    keyedRsvps: getServiceRoleKeyedPublicRsvpGateway(),
  };
}
