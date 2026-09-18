import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { ProjectLifecycleGateway } from "./project-lifecycle-gateway";
import type { MarkPaidResult } from "./project-lifecycle-types";
import { validateMarkPaidInput } from "./validate-mark-paid-input";

/**
 * Mark-Project-Paid use case (Task 025 Phase 2). Always calls the
 * `mark_project_paid` RPC via the gateway — never a plain RLS UPDATE — so
 * the already-PAID conflict, the AWAITING_PAYMENT precondition, and the
 * audited `PROJECT_MARKED_PAID` activity log all happen atomically
 * server-side. No payment-state precheck is duplicated here.
 */
export async function markProjectPaid<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: ProjectLifecycleGateway<TClient>,
): Promise<MarkPaidResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }

  validateMarkPaidInput(rawBody);

  return gateway.markPaid(staff.supabase, rawProjectId);
}
