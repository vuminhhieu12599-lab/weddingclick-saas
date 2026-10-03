import { ApiError, type ApiErrorKind } from "../errors/api-error";

/**
 * Stable customer-facing reason for a CONFLICT, so the review page can show
 * the right Vietnamese state without parsing message text.
 */
export type CustomerReviewConflictReason = "REVIEW_SUPERSEDED" | "REVIEW_CLOSED" | "ALREADY_DECIDED";

/**
 * Business-error contract for `get_customer_review` / `submit_review_feedback`
 * (migration 0037), keyed by custom SQLSTATE — never by message text. Every
 * other SQLSTATE (including the 0016 guards/unique index as backstops)
 * surfaces as a generic 500. RV011–RV013 mirror the Task 026 resolver
 * semantics (404 / 410) for the resolution-to-RPC race.
 */
export const CUSTOMER_REVIEW_RPC_ERROR_CODES: Readonly<
  Record<string, { kind: ApiErrorKind; message: string; reason?: CustomerReviewConflictReason }>
> = {
  RV011: { kind: "NOT_FOUND", message: "Access link not found" },
  RV012: { kind: "REVOKED_TOKEN", message: "Access link has been revoked" },
  RV013: { kind: "EXPIRED_TOKEN", message: "Access link has expired" },
  RV014: { kind: "BAD_REQUEST", message: "Feedback type or message is invalid" },
  RV015: { kind: "NOT_FOUND", message: "Review version not found" },
  RV016: { kind: "CONFLICT", message: "This review version has been superseded", reason: "REVIEW_SUPERSEDED" },
  RV017: { kind: "CONFLICT", message: "This review is not open for feedback", reason: "REVIEW_CLOSED" },
  RV018: { kind: "CONFLICT", message: "A decision has already been recorded for this review version", reason: "ALREADY_DECIDED" },
};

/** A customer-facing CONFLICT carrying its stable reason (409 + `reason`). */
export class CustomerReviewConflictError extends ApiError {
  readonly reason: CustomerReviewConflictReason;

  constructor(message: string, reason: CustomerReviewConflictReason) {
    super("CONFLICT", message);
    this.name = "CustomerReviewConflictError";
    this.reason = reason;
  }
}

/** Maps a 0037 RPC error by SQLSTATE; anything unknown is a generic (non-ApiError) failure → 500. */
export function mapCustomerReviewRpcError(code: string, fallbackMessage: string): never {
  const known = CUSTOMER_REVIEW_RPC_ERROR_CODES[code];
  if (known?.reason !== undefined) {
    throw new CustomerReviewConflictError(known.message, known.reason);
  }
  if (known) {
    throw new ApiError(known.kind, known.message);
  }
  throw new Error(fallbackMessage);
}
