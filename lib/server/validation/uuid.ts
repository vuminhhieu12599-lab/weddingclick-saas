/**
 * Shared UUID shape validator for request parsing (Task 005).
 *
 * Deliberately format-only (does not check RFC 4122 version/variant nibbles)
 * — every V2 id is `gen_random_uuid()` (v4), but rejecting a syntactically
 * valid UUID of a different version would be an arbitrary extra restriction
 * with no security value; the real authorization/existence check always
 * happens against the database afterward.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
