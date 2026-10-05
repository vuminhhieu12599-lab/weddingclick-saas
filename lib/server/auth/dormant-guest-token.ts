import { generateAccessToken } from "./access-token-crypto";

/**
 * Task 033E-A — placeholder `guests.token_hash` for a guest created before
 * any personalized link exists (0017 keeps the column NOT NULL + UNIQUE).
 *
 * The SHA-256 digest of a fresh 32-byte CSPRNG token (the canonical Task 026
 * generator). Only the 32-byte hash is returned: the raw token and hint are
 * dropped here, never persisted, logged or delivered, so nobody can ever
 * present it. It is also not a credential by construction — the 0042
 * resolver ignores any guest whose `token_issued_at IS NULL`. A usable link
 * exists only after ISSUE (Task 033B1 / 033E-B) rotates the hash in place.
 */
export function generateDormantGuestTokenHash(): Uint8Array {
  return generateAccessToken().tokenHash;
}
