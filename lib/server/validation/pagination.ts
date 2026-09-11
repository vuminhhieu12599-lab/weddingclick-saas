import { ApiError } from "../errors/api-error";

/**
 * Shared list-endpoint pagination parsing (Task 005).
 *
 * V1 scope is deliberately simple — a bounded `limit` only, no cursor/offset
 * infrastructure (CLAUDE.md Task 005 "Do NOT add pagination infrastructure
 * beyond what this scope needs").
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parseLimit(rawLimit: string | null): number {
  if (rawLimit === null) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number(rawLimit);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw new ApiError(
      "BAD_REQUEST",
      `limit must be an integer between 1 and ${MAX_LIMIT}`,
    );
  }

  return parsed;
}
