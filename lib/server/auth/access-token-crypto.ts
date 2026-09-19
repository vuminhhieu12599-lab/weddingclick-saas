import { createHash, randomBytes } from "node:crypto";

/**
 * Access-token crypto utility (Task 026 Phase 2, docs/DECISIONS.md D7).
 *
 * Raw token: 32 CSPRNG bytes, unpadded base64url-encoded — always exactly 43
 * characters. `token_hash`: the SHA-256 digest (exactly 32 bytes) of the raw
 * token's UTF-8 bytes, returned as a `Uint8Array` so the repository boundary
 * controls its own database (BYTEA) serialization — see
 * lib/server/supabase/postgres-bytea.ts. `token_hint`: the raw token's final
 * 8 characters, display-only, never used for lookup/authentication.
 *
 * The raw token is never persisted, logged, or derived from project/customer
 * data — it exists only in the return value of generateAccessToken() and the
 * delivered URL a later phase builds from it.
 */
const RAW_TOKEN_BYTE_LENGTH = 32;
const RAW_TOKEN_LENGTH = 43;
const TOKEN_HINT_LENGTH = 8;

/** Frozen raw-token shape (D7): unpadded base64url, exactly 43 characters. */
const RAW_TOKEN_SHAPE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface GeneratedAccessToken {
  rawToken: string;
  tokenHash: Uint8Array;
  tokenHint: string;
}

export function generateAccessToken(): GeneratedAccessToken {
  const rawToken = randomBytes(RAW_TOKEN_BYTE_LENGTH).toString("base64url");

  return {
    rawToken,
    tokenHash: hashAccessToken(rawToken),
    tokenHint: rawToken.slice(-TOKEN_HINT_LENGTH),
  };
}

/** Deterministic SHA-256 digest (exactly 32 bytes) of the raw token's UTF-8 bytes. */
export function hashAccessToken(rawToken: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(rawToken, "utf8").digest());
}

/**
 * Frozen raw-token shape check (D7/§4): exactly 43 characters, base64url
 * alphabet only, no padding. Deliberately format-only — it never reveals
 * *why* a token is malformed to a caller (resolution maps every malformed
 * shape to the same NOT_FOUND outcome as an unknown hash, per D4).
 */
export function isValidRawAccessTokenShape(value: string): boolean {
  return RAW_TOKEN_SHAPE_PATTERN.test(value);
}

export { RAW_TOKEN_LENGTH };
