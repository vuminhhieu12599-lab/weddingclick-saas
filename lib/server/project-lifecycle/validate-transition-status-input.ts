import { PROJECT_STATUSES, type ProjectStatus } from "../../domain";
import { ApiError } from "../errors/api-error";
import type { TransitionStatusInput } from "./project-lifecycle-types";

/**
 * Defensive app-layer cap on `reason` — task spec §1/§5: optional, trimmed,
 * blank -> null, max 2000 characters. Mirrors PL010's own 2000-character
 * limit (migration 0024) so a request that would fail PL010 anyway is
 * rejected as BAD_REQUEST at the HTTP boundary instead of round-tripping to
 * the database first.
 */
const MAX_REASON_LENGTH = 2000;

const ACCEPTED_FIELDS = new Set(["targetStatus", "reason"]);

/**
 * Parses/validates a raw PATCH /status request body (Task 025 Phase 2 task
 * spec §1/§5).
 *
 * Deliberately validates input SHAPE only — every one of the 12 recognized
 * `ProjectStatus` values (including the reserved targets CUSTOMER_REVIEW /
 * REVISION_REQUIRED / APPROVED / PUBLISHED) is accepted here as
 * syntactically valid. The transition graph, same-status conflict, reserved
 * targets, and the AWAITING_PAYMENT -> READY_TO_PUBLISH payment
 * precondition remain the exclusive authority of `transition_project_status`
 * (PL003–PL006) — this validator never reimplements that graph.
 */
export function validateTransitionStatusInput(body: unknown): TransitionStatusInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ACCEPTED_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }

  if (!("targetStatus" in record)) {
    throw new ApiError("BAD_REQUEST", `"targetStatus" is required`);
  }

  const targetStatus = parseTargetStatus(record.targetStatus);
  const reason = parseOptionalReason(record);

  return { targetStatus, reason };
}

function parseTargetStatus(value: unknown): ProjectStatus {
  if (typeof value !== "string" || !(PROJECT_STATUSES as readonly string[]).includes(value)) {
    throw new ApiError(
      "BAD_REQUEST",
      `"targetStatus" must be one of: ${PROJECT_STATUSES.join(", ")}`,
    );
  }

  return value as ProjectStatus;
}

function parseOptionalReason(record: Record<string, unknown>): string | null {
  if (!("reason" in record)) {
    return null;
  }

  const value = record.reason;

  if (typeof value !== "string") {
    throw new ApiError("BAD_REQUEST", `"reason" must be a string`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > MAX_REASON_LENGTH) {
    throw new ApiError(
      "BAD_REQUEST",
      `"reason" exceeds the maximum length of ${MAX_REASON_LENGTH} characters`,
    );
  }

  return trimmed;
}
