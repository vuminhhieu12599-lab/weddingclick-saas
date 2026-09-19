/**
 * Postgres BYTEA query-parameter serialization (Task 026 Phase 2, §11).
 *
 * PostgREST/postgrest-js filter values are transmitted as text; for a BYTEA
 * column, Postgres's own text input format for a hex-encoded value is
 * `\x` followed by lowercase hex pairs (e.g. `\xdeadbeef`). This is the only
 * representation conversion the resolution repository performs — the
 * application-level hash remains a plain 32-byte digest everywhere else.
 */
export function toPostgresByteaHexLiteral(bytes: Uint8Array): string {
  return `\\x${Buffer.from(bytes).toString("hex")}`;
}
