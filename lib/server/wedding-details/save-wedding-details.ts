import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import { validateSaveWeddingDetailsInput } from "./validate-save-wedding-details-input";
import type { WeddingDetailsGateway } from "./wedding-details-gateway";
import type { SaveWeddingDetailsResult } from "./wedding-details-types";

/**
 * Save-Wedding-Details use case (Task 022, TRUSTED BUSINESS ACTION per
 * API_CONTRACT.md §3.1). Always calls the `save_wedding_details` RPC via the
 * gateway — never a plain RLS INSERT/UPDATE — so the atomic audited
 * upsert + no-op detection + `CANONICAL_DATA_APPLIED` activity log all
 * happen server-side in one transaction (API_CONTRACT.md §3.1, §6).
 */
export async function saveWeddingDetails<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: WeddingDetailsGateway<TClient>,
): Promise<SaveWeddingDetailsResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  const input = validateSaveWeddingDetailsInput(rawBody);

  return gateway.saveWeddingDetails(staff.supabase, rawProjectId, input);
}
