import { ApiError } from "../errors/api-error";
import { validateSaveWeddingDetailsInput } from "../wedding-details/validate-save-wedding-details-input";
import type { SaveWeddingDetailsInput } from "../wedding-details/wedding-details-types";

/**
 * Parses/validates a raw POST /api/v2/public/intake-submissions request body
 * (Task 027 Phase 2 frozen contract §2.2). The frozen shape is exactly:
 *
 *   { "weddingDetails": { ...Task-022 writable Wedding Details fields... } }
 *
 * `weddingDetails` is mechanically reused via `validateSaveWeddingDetailsInput`
 * (Task 022) — never a divergent second Wedding Details field model. Every
 * caller-controlled structural field this validator would reject (a
 * top-level `projectId`/`accessLinkId`/`status`/... or the Task-022
 * server-owned fields nested under `weddingDetails`) is rejected exactly
 * once, by the layer that already owns that check.
 */
const ACCEPTED_FIELDS = new Set(["weddingDetails"]);

export function validateSubmitIntakeInput(body: unknown): SaveWeddingDetailsInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }

  const record = body as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!ACCEPTED_FIELDS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unknown field "${key}" is not accepted`);
    }
  }

  if (!("weddingDetails" in record)) {
    throw new ApiError("BAD_REQUEST", `"weddingDetails" is required`);
  }

  return validateSaveWeddingDetailsInput(record.weddingDetails);
}
