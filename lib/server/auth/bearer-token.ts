/**
 * Parses an `Authorization` header value, accepting exactly the
 * `Bearer <token>` scheme (Task 004).
 *
 * Rejects (returns null) rather than throws for every malformed case —
 * missing header, wrong scheme, or an empty token after the scheme — so
 * callers can uniformly treat "no usable token" as 401 Unauthenticated.
 *
 * Never logs the header value or the extracted token.
 */
const BEARER_PREFIX = "Bearer ";

export function parseBearerToken(
  authorizationHeader: string | null | undefined,
): string | null {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  if (!authorizationHeader.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();

  if (token.length === 0) {
    return null;
  }

  return token;
}
