import type { SaveWeddingDetailsInput } from "../wedding-details/wedding-details-types";
import type { SubmitIntakeSubmissionResult } from "./intake-types";

/**
 * Narrow seam (Task 027 Phase 2) for the PUBLIC submit path's
 * service-role-backed step, mirroring
 * lib/server/supabase/access-link-resolution-repository.ts's
 * `AccessLinkResolutionRepository` shape: no `TClient` generic, because this
 * gateway is never invoked with anything but the dedicated, server-only
 * service-role Supabase client (never exposed to the browser, never used for
 * ordinary staff convenience — frozen Task 027 Phase 2 contract §8).
 *
 * Exposes exactly one capability — calling the `submit_intake_submission`
 * RPC with an already-resolved `{ project id, INTAKE access-link id }`
 * context plus validated Wedding Details fields. The raw bearer token is
 * never a parameter here and must never be threaded into this call (frozen
 * §8: "The raw token MUST NOT be passed into submit_intake_submission").
 */
export interface SubmitIntakeSubmissionParams {
  projectId: string;
  accessLinkId: string;
  weddingDetails: SaveWeddingDetailsInput;
}

export interface IntakeSubmitGateway {
  submitIntakeSubmission(
    params: SubmitIntakeSubmissionParams,
  ): Promise<SubmitIntakeSubmissionResult>;
}
