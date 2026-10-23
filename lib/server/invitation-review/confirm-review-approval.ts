import { isApprovalChannel, STAFF_APPROVAL_NOTE_MAX_LENGTH, type ApprovalChannel } from "../../domain";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import type { InvitationReviewGateway } from "./invitation-review-gateway";
import type { ConfirmReviewApprovalCommand, StaffConfirmedApproval } from "./invitation-review-types";

export interface ConfirmReviewApprovalDependencies<TClient> {
  reviews: Pick<InvitationReviewGateway<TClient>, "confirmReviewApproval">;
}

const COMMAND_KEYS: ReadonlySet<string> = new Set([
  "invitationVersionId",
  "expectedCurrentReviewVersionId",
  "channel",
  "note",
]);

/**
 * Strict allow-list parse: a staff member id, actor type, project id,
 * variant, status target or feedback type in the body is rejected outright,
 * so the browser can never supply an authoritative value — not even one the
 * server would ignore. The confirming staff member is `auth.uid()` inside
 * the RPC and is never part of this command.
 */
export function parseConfirmReviewApprovalCommand(raw: unknown): ConfirmReviewApprovalCommand {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }
  for (const key of Object.keys(raw)) {
    if (!COMMAND_KEYS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unexpected field: ${key}`);
    }
  }
  const { invitationVersionId, expectedCurrentReviewVersionId, channel, note } = raw as Record<string, unknown>;
  if (typeof invitationVersionId !== "string" || !isValidUuid(invitationVersionId)) {
    throw new ApiError("BAD_REQUEST", "invitationVersionId must be a UUID");
  }
  if (typeof expectedCurrentReviewVersionId !== "string" || !isValidUuid(expectedCurrentReviewVersionId)) {
    throw new ApiError("BAD_REQUEST", "expectedCurrentReviewVersionId must be a UUID");
  }
  if (!isApprovalChannel(channel)) {
    throw new ApiError("BAD_REQUEST", "channel must be ZALO, PHONE, IN_PERSON or OTHER");
  }
  if (note !== null && note !== undefined && typeof note !== "string") {
    throw new ApiError("BAD_REQUEST", "note must be a string or null");
  }
  const trimmed = typeof note === "string" ? note.trim() : "";
  if (trimmed.length > STAFF_APPROVAL_NOTE_MAX_LENGTH) {
    throw new ApiError("BAD_REQUEST", "note must be 2000 characters or fewer");
  }
  return {
    invitationVersionId,
    expectedCurrentReviewVersionId,
    channel: channel as ApprovalChannel,
    note: trimmed === "" ? null : trimmed,
  };
}

/**
 * TE-06 — record the customer's approval of one exact REVIEW version on
 * their behalf (T12): strict command parse → `staff_confirm_review_approval`
 * (migration 0053; atomic: staff self-authorization, recognized channel,
 * Project status gate, the CURRENT REVIEW of a REQUIRED variant under the
 * invitation row lock, compare-and-set on the expected version, first
 * decision final, one STAFF `APPROVAL` row, audit, aggregate outcome
 * recompute).
 *
 * Nothing is built or decided here: the approval target is an existing
 * immutable REVIEW row, so no draft is loaded, no Snapshot is built and no
 * publication state is read or written. The result is re-checked against
 * the command.
 */
export async function confirmReviewApproval<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  deps: ConfirmReviewApprovalDependencies<TClient>,
): Promise<StaffConfirmedApproval> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const command = parseConfirmReviewApprovalCommand(rawBody);

  const approval = await deps.reviews.confirmReviewApproval(staff.supabase, {
    projectId: rawProjectId,
    ...command,
  });

  if (
    approval.projectId !== rawProjectId ||
    approval.invitationVersionId !== command.invitationVersionId ||
    approval.approvalChannel !== command.channel
  ) {
    throw new Error("Confirmed approval does not match the request");
  }
  return approval;
}
