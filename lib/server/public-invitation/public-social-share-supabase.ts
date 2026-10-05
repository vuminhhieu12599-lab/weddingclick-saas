import { getServiceRolePublicSocialShareCoverGateway } from "../supabase/public-social-share-repository";
import type { PublicSocialShareCoverGateway } from "./public-social-share-types";

/**
 * Production wiring for the Task 032B /i/[slug] social metadata. Built per
 * request (no module-scope client or secret). Imported only by
 * app/i/[slug]/page.tsx.
 */
export function createPublicSocialShareCoverGateway(): PublicSocialShareCoverGateway {
  return getServiceRolePublicSocialShareCoverGateway();
}
