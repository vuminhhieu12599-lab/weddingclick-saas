import { getServiceRoleAccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import { getServiceRoleCustomerPortalGateway } from "../supabase/customer-portal-repository";
import { getServiceRolePortalGuestGateway } from "../supabase/portal-guest-repository";
import type { LoadCustomerPortalDependencies } from "./load-customer-portal";

/**
 * Production wiring for the Task 033C private Customer Portal. Built per
 * request (no module-scope client or secret): Task 026 token resolution and
 * the read-only, Project-scoped portal repository and (Task 033E-A) the
 * Project-pinned guest gateway stay separate. Imported
 * only by app/portal/[token]/page.tsx.
 */
export function createCustomerPortalPageDependencies(): LoadCustomerPortalDependencies {
  return {
    resolution: getServiceRoleAccessLinkResolutionRepository(),
    portal: getServiceRoleCustomerPortalGateway(),
    guests: getServiceRolePortalGuestGateway(),
  };
}
