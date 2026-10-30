import { createHash } from "node:crypto";

/**
 * RSVP-P0-03 — the generic RSVP correction key, server side
 * (docs/DECISIONS.md "RSVP-P0-03 — Generic RSVP Correction Key";
 * docs/API_CONTRACT.md §41).
 *
 * A response key is 32 CSPRNG bytes the public invitation page generates
 * when it mounts and keeps in memory for that one mounted page. It exists so
 * "Sửa lại hồi âm" can correct the response that page already submitted
 * instead of inserting a duplicate row.
 *
 * It is deliberately NOT an access link and NOT authorization: there is no
 * issuance, no lookup table, no expiry and no revocation. A keyed write is
 * authorized exactly as an unkeyed one is — by the invitation the public
 * slug CURRENTLY publishes — and the key can only ever reach the one row it
 * created, inside that same invitation and Project (migration 0056). Hence
 * the separate module: it must not drift into or borrow from the
 * access-link/guest-token contract in ../auth/access-token-crypto.ts (D7).
 *
 * Only the SHA-256 digest crosses into the database. The raw key is never
 * stored, logged, put in a URL, returned to the browser or shown in the
 * Portal. It is never derived from a guest name, an IP or a device.
 */

/** 32 random bytes, unpadded base64url — always exactly 43 characters. */
const RESPONSE_KEY_SHAPE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const GENERIC_RSVP_RESPONSE_KEY_LENGTH = 43;

/** Format-only, like every other opaque-value shape check: it reveals nothing about why a value is rejected. */
export function isValidGenericRsvpResponseKeyShape(value: string): boolean {
  return RESPONSE_KEY_SHAPE_PATTERN.test(value);
}

/** Deterministic SHA-256 digest (exactly 32 bytes) of the raw key's UTF-8 bytes — what 0056 stores. */
export function hashGenericRsvpResponseKey(rawKey: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(rawKey, "utf8").digest());
}
