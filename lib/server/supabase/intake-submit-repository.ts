import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../errors/api-error";
import type { IntakeSubmitGateway, SubmitIntakeSubmissionParams } from "../intake/intake-submit-gateway";
import { INTAKE_RPC_ERROR_CODES } from "../intake/intake-rpc-error-codes";
import type { SubmitIntakeSubmissionResult } from "../intake/intake-types";
import { isValidTimestamptz } from "../validation/timestamptz";
import { isValidUuid } from "../validation/uuid";
import { createServiceRoleSupabaseClient } from "./service-role-client";

/**
 * Production, service-role-backed IntakeSubmitGateway (Task 027 Phase 2,
 * frozen contract §7/§8). The only production module besides
 * lib/server/supabase/access-link-resolution-repository.ts that imports
 * lib/server/supabase/service-role-client.ts — see the narrow, exact
 * two-file allowlist added to
 * lib/server/access-links/__tests__/token-resolution-static-security-review.test.ts
 * for this Task 027 Phase 2 compatibility change.
 *
 * Exposes exactly one capability — calling `submit_intake_submission` with
 * an already-resolved `{ project id, INTAKE access-link id }` context plus
 * validated Wedding Details fields. Never accepts or forwards a raw token.
 * Never imports or calls anything from
 * lib/server/supabase/access-link-resolution-repository.ts — the two
 * service-role-backed modules are deliberately isolated from each other
 * (frozen §7: "Strong separation requirement").
 */
interface SubmitIntakeSubmissionRpcRow {
  id: string;
  project_id: string;
  status: "PENDING";
  submitted_at: string;
}

/**
 * Runtime shape hardening (mirrors the Task 026 Phase 2/3 repository
 * pattern) — a TypeScript cast alone is never trusted for a privileged,
 * RLS-bypassing mutation result. `status` is checked against the exact
 * literal `"PENDING"` (Task 027 Phase 2 Independent Review Patch 1, Finding
 * B) — not merely "any recognized IntakeSubmissionStatus" — because a fresh
 * submission is never created in any other state; an otherwise-valid row
 * reporting e.g. `"APPLIED"` is exactly as untrustworthy as a malformed row.
 */
function isSubmitIntakeSubmissionRow(row: unknown): row is SubmitIntakeSubmissionRpcRow {
  if (typeof row !== "object" || row === null) {
    return false;
  }
  const candidate = row as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    isValidUuid(candidate.id) &&
    typeof candidate.project_id === "string" &&
    isValidUuid(candidate.project_id) &&
    candidate.status === "PENDING" &&
    typeof candidate.submitted_at === "string" &&
    isValidTimestamptz(candidate.submitted_at)
  );
}

function mapRpcError(error: { code: string; message: string }, fallbackMessage: string): never {
  const known = INTAKE_RPC_ERROR_CODES[error.code];
  if (known) {
    throw new ApiError(known.kind, known.message);
  }
  throw new Error(fallbackMessage);
}

/**
 * Result-shape hardening (mirrors access-link-staff-repository.ts's
 * `extractSingleRow`, Finding B): `submit_intake_submission` is declared
 * `RETURNS TABLE` for exactly one row — a result that is not an array, or an
 * array whose length is not exactly 1 (zero or more-than-one), is always an
 * unexpected failure shape, never forwarded to the caller.
 */
function extractSingleRow(data: unknown, fallbackMessage: string): unknown {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(fallbackMessage);
  }
  return data[0];
}

/**
 * Pure, testable gateway core — takes any Supabase-client-shaped object, so
 * unit tests can mock the client at this narrow boundary without a real
 * network call or a real `SUPABASE_SERVICE_ROLE_KEY`.
 */
export function createIntakeSubmitGateway(client: SupabaseClient): IntakeSubmitGateway {
  return {
    async submitIntakeSubmission(
      params: SubmitIntakeSubmissionParams,
    ): Promise<SubmitIntakeSubmissionResult> {
      const { weddingDetails } = params;

      const { data, error } = await client.rpc("submit_intake_submission", {
        p_project_id: params.projectId,
        p_access_link_id: params.accessLinkId,
        p_groom_name: weddingDetails.groomName,
        p_bride_name: weddingDetails.brideName,
        p_groom_father: weddingDetails.groomFather,
        p_groom_mother: weddingDetails.groomMother,
        p_bride_father: weddingDetails.brideFather,
        p_bride_mother: weddingDetails.brideMother,
        p_groom_family_address: weddingDetails.groomFamilyAddress,
        p_bride_family_address: weddingDetails.brideFamilyAddress,
        p_invitation_message: weddingDetails.invitationMessage,
        p_love_story: weddingDetails.loveStory,
        p_lunar_date_display: weddingDetails.lunarDateDisplay,
        p_additional_note: weddingDetails.additionalNote,
        p_groom_bank_name: weddingDetails.groomBankName,
        p_groom_bank_account_name: weddingDetails.groomBankAccountName,
        p_groom_bank_account_number: weddingDetails.groomBankAccountNumber,
        p_groom_bank_qr_media_id: weddingDetails.groomBankQrMediaId,
        p_bride_bank_name: weddingDetails.brideBankName,
        p_bride_bank_account_name: weddingDetails.brideBankAccountName,
        p_bride_bank_account_number: weddingDetails.brideBankAccountNumber,
        p_bride_bank_qr_media_id: weddingDetails.brideBankQrMediaId,
      });

      if (error) {
        mapRpcError(error, "Failed to submit intake submission");
      }

      const row = extractSingleRow(data, "Failed to submit intake submission");

      if (!isSubmitIntakeSubmissionRow(row)) {
        throw new Error("Failed to submit intake submission");
      }

      // Mutation-result identity hardening (mirrors the Task 026 Phase 3
      // repository pattern): a structurally valid row for the wrong project
      // is never forwarded as a success.
      if (row.project_id !== params.projectId) {
        throw new Error("Failed to submit intake submission");
      }

      return {
        id: row.id,
        projectId: row.project_id,
        status: row.status,
        submittedAt: row.submitted_at,
      };
    },
  };
}

/**
 * Production wiring: creates a fresh `service_role` client per call (no
 * top-level/module-scope client, no cached secret — mirrors
 * getServiceRoleAccessLinkResolutionRepository()) and hands it to the pure
 * gateway above.
 */
export function getServiceRoleIntakeSubmitGateway(): IntakeSubmitGateway {
  return createIntakeSubmitGateway(createServiceRoleSupabaseClient());
}
