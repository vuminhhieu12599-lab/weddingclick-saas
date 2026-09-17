import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { MediaGateway } from "./media-gateway";
import type { UpdateProjectMediaResult } from "./media-types";
import { validateUpdateProjectMediaInput } from "./validate-update-project-media-input";

/**
 * Update-Project-Media use case (Task 024 Phase 3, DIRECT RLS UPDATE per
 * API_CONTRACT.md §3.2 — `alt_text`/`sort_order` are explicitly classified
 * as "safe, non-domain-meaningful edits," never a business action). Always
 * a genuine partial update: the validator preserves field presence, and
 * the gateway builds its SQL UPDATE from exactly the provided keys — never
 * a full-row read-modify-write (see media-gateway.ts /
 * project-media-repository.ts). Same-value PATCHes are allowed and issue
 * the UPDATE normally; no pre-read/compare no-op suppression is performed
 * (there is no activity log here to protect from a spurious write — the
 * reason Task 023's RPC-driven no-op detection existed does not apply).
 */
export async function updateProjectMedia<TClient>(
  rawProjectId: string,
  rawMediaId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: MediaGateway<TClient>,
): Promise<UpdateProjectMediaResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  if (!isValidUuid(rawMediaId)) {
    throw new ApiError("BAD_REQUEST", "Media id must be a valid UUID");
  }

  const exists = await gateway.projectExists(staff.supabase, rawProjectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const patch = validateUpdateProjectMediaInput(rawBody);

  const outcome = await gateway.updateProjectMedia(
    staff.supabase,
    rawProjectId,
    rawMediaId,
    patch,
  );

  if (outcome.kind === "NOT_FOUND") {
    // Wrong-project media id and nonexistent media id are indistinguishable
    // by design — the gateway's UPDATE is scoped by (project_id, id)
    // together, so both cases collapse to the same zero-rows outcome here.
    throw new ApiError("NOT_FOUND", "Media not found");
  }

  return { media: outcome.media };
}
