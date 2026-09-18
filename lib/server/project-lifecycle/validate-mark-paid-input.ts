import { ApiError } from "../errors/api-error";

const ACCEPTED_FIELDS = new Set(["action"]);

/**
 * Parses/validates a raw PATCH /payment request body (Task 025 Phase 2 task
 * spec §1/§5). Exactly `{ "action": "MARK_PAID" }` is accepted — no empty
 * body, no other action value, no unknown fields, and no generic
 * payment-status setter. Returns nothing: there is no normalized input to
 * carry forward beyond the fixed action itself.
 */
export function validateMarkPaidInput(body: unknown): void {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ACCEPTED_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }

  if (!("action" in record)) {
    throw new ApiError("BAD_REQUEST", `"action" is required`);
  }

  if (record.action !== "MARK_PAID") {
    throw new ApiError("BAD_REQUEST", `"action" must be "MARK_PAID"`);
  }
}
