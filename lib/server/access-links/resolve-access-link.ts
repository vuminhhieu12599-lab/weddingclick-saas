import { hashAccessToken, isValidRawAccessTokenShape } from "../auth/access-token-crypto";
import { ApiError } from "../errors/api-error";
import type { AccessLinkResolutionRepository } from "../supabase/access-link-resolution-repository";
import type { ResolveAccessLinkInput, ResolvedAccessLinkContext } from "./access-link-resolution-types";

/**
 * Access-link token-resolution use case (Task 026 Phase 2,
 * docs/DECISIONS.md D4 — frozen resolution order). Implements the exact
 * sequence, in order:
 *
 *   A. raw token shape malformed        -> NOT_FOUND
 *   B. hash the raw token
 *   C. repository lookup by hash
 *   D. no matching row                  -> NOT_FOUND
 *   E. expected purpose mismatch        -> NOT_FOUND
 *   F. expected project mismatch        -> NOT_FOUND (skipped if not supplied)
 *   G. revoked_at non-null              -> REVOKED_TOKEN
 *   H. expires_at non-null AND <= now   -> EXPIRED_TOKEN
 *   I. update last_used_at
 *   J. return narrow validated context
 *
 * Purpose/project are checked before revoked/expired can ever be disclosed
 * (anti-enumeration, docs/API_CONTRACT.md §4.1) — unknown hash, wrong
 * purpose, and wrong project are all indistinguishable NOT_FOUND outcomes.
 * If both revoked and expired hold, REVOKED_TOKEN wins (checked first).
 *
 * last_used_at is updated only after every prior check has passed — a
 * malformed/unknown/wrong-purpose/wrong-project/revoked/expired token never
 * touches the row. If the last_used_at update itself fails, resolution is
 * NOT successful: the repository throws a generic (non-ApiError) failure,
 * which this function lets propagate as-is, mapping to a generic INTERNAL
 * (500) at the HTTP layer rather than silently returning a validated
 * context on top of an unrecorded usage failure.
 *
 * `now` is an injectable clock (defaults to the real clock) so the
 * expires_at boundary can be tested deterministically without sleeping.
 */
export async function resolveAccessLink(
  input: ResolveAccessLinkInput,
  repository: AccessLinkResolutionRepository,
  now: () => Date = () => new Date(),
): Promise<ResolvedAccessLinkContext> {
  if (!isValidRawAccessTokenShape(input.rawToken)) {
    throw new ApiError("NOT_FOUND", "Access link not found");
  }

  const tokenHash = hashAccessToken(input.rawToken);
  const row = await repository.lookupByTokenHash(tokenHash);

  if (!row) {
    throw new ApiError("NOT_FOUND", "Access link not found");
  }

  if (row.linkType !== input.expectedLinkType) {
    throw new ApiError("NOT_FOUND", "Access link not found");
  }

  if (input.expectedProjectId !== undefined && row.projectId !== input.expectedProjectId) {
    throw new ApiError("NOT_FOUND", "Access link not found");
  }

  if (row.revokedAt !== null) {
    throw new ApiError("REVOKED_TOKEN", "Access link has been revoked");
  }

  if (row.expiresAt !== null && new Date(row.expiresAt).getTime() <= now().getTime()) {
    throw new ApiError("EXPIRED_TOKEN", "Access link has expired");
  }

  await repository.touchLastUsedAt(row.id);

  return {
    accessLinkId: row.id,
    projectId: row.projectId,
    linkType: row.linkType,
  };
}
