import { ApiError, type ApiErrorKind } from "../errors/api-error";
import type { PublishBlockerReason } from "./invitation-publish-types";

/**
 * Stable business-error contract for `publish_invitation` (migration 0038),
 * keyed by the custom SQLSTATE it raises — never by message text. Messages
 * are fixed, safe application strings. PB013 (integrity fault — a server
 * defect, never caller input) is deliberately unmapped, as is every other
 * SQLSTATE: those surface as a generic 500.
 */
export const PUBLISH_RPC_ERROR_CODES: Readonly<
  Record<string, { kind: ApiErrorKind; message: string; reason?: PublishBlockerReason }>
> = {
  PB001: { kind: "FORBIDDEN", message: "Active WeddingClick staff role required" },
  PB002: { kind: "NOT_FOUND", message: "Project not found" },
  PB003: { kind: "INVARIANT", message: "Variant is not required by the Project package" },
  PB004: { kind: "INVARIANT", message: "Project package has no invitation variant policy" },
  PB005: { kind: "CONFLICT", message: "Project is not ready to publish", reason: "LIFECYCLE_NOT_READY" },
  PB006: { kind: "CONFLICT", message: "Project payment is not confirmed", reason: "PAYMENT_NOT_READY" },
  PB007: { kind: "CONFLICT", message: "Project is already published or closed", reason: "PROJECT_CLOSED" },
  PB008: { kind: "CONFLICT", message: "Invitation has no current review version", reason: "NOT_APPROVED" },
  PB009: { kind: "CONFLICT", message: "Current review version has changed; reload and try again", reason: "STALE_REVIEW" },
  PB010: { kind: "CONFLICT", message: "Published version has changed; reload and try again", reason: "STALE_PUBLISHED_VERSION" },
  PB011: { kind: "CONFLICT", message: "Current review version is not approved", reason: "NOT_APPROVED" },
  PB012: { kind: "CONFLICT", message: "Current review version is already published", reason: "ALREADY_PUBLISHED" },
};

/** A publish CONFLICT carrying its stable reason (409 + `reason`). */
export class PublishConflictError extends ApiError {
  readonly reason: PublishBlockerReason;

  constructor(message: string, reason: PublishBlockerReason) {
    super("CONFLICT", message);
    this.name = "PublishConflictError";
    this.reason = reason;
  }
}

/** Maps a 0038 RPC error by SQLSTATE; anything unknown is a generic (non-ApiError) failure → 500. */
export function mapPublishRpcError(code: string): never {
  const known = PUBLISH_RPC_ERROR_CODES[code];
  if (known?.reason !== undefined) {
    throw new PublishConflictError(known.message, known.reason);
  }
  if (known) {
    throw new ApiError(known.kind, known.message);
  }
  throw new Error("Failed to publish invitation");
}
