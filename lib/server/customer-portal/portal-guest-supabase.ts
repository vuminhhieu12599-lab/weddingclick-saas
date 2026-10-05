import { getServiceRoleAccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import { getServiceRolePortalGuestGateway } from "../supabase/portal-guest-repository";
import type { PortalGuestToolDependencies } from "./portal-guest-tool";

/**
 * Production wiring for the Task 033E-A Portal Guest Tool routes. Built per
 * request (no module-scope client or secret): Task 026 PORTAL token
 * resolution and the Project-pinned guest gateway stay separate. Imported
 * only by the three app/api/v2/public/portal/guests route files.
 */
export function createPortalGuestToolDependencies(): PortalGuestToolDependencies {
  return {
    resolution: getServiceRoleAccessLinkResolutionRepository(),
    guests: getServiceRolePortalGuestGateway(),
  };
}
