import { describe, expect, it } from "vitest";

import {
  generateAccessToken,
  hashAccessToken,
  isValidRawAccessTokenShape,
} from "../access-token-crypto";

const BASE64URL_CHARSET_PATTERN = /^[A-Za-z0-9_-]+$/;

describe("generateAccessToken", () => {
  it("produces a raw token exactly 43 characters long", () => {
    const { rawToken } = generateAccessToken();
    expect(rawToken).toHaveLength(43);
  });

  it("produces a raw token using only the base64url alphabet", () => {
    const { rawToken } = generateAccessToken();
    expect(rawToken).toMatch(BASE64URL_CHARSET_PATTERN);
  });

  it("never pads the raw token with '='", () => {
    const { rawToken } = generateAccessToken();
    expect(rawToken).not.toContain("=");
  });

  it("decodes the raw token to exactly 32 bytes", () => {
    const { rawToken } = generateAccessToken();
    expect(Buffer.from(rawToken, "base64url")).toHaveLength(32);
  });

  it("produces different tokens on repeated calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateAccessToken().rawToken));
    expect(tokens.size).toBe(20);
  });

  it("sets tokenHint to exactly the final 8 characters of the raw token", () => {
    const { rawToken, tokenHint } = generateAccessToken();
    expect(tokenHint).toBe(rawToken.slice(-8));
    expect(tokenHint).toHaveLength(8);
  });

  it("returns a tokenHash exactly 32 bytes long", () => {
    const { tokenHash } = generateAccessToken();
    expect(tokenHash).toBeInstanceOf(Uint8Array);
    expect(tokenHash).toHaveLength(32);
  });

  it("returns a tokenHash that is the SHA-256 digest of the returned rawToken", () => {
    const { rawToken, tokenHash } = generateAccessToken();
    expect(Buffer.from(tokenHash)).toEqual(Buffer.from(hashAccessToken(rawToken)));
  });
});

describe("hashAccessToken", () => {
  it("returns exactly a 32-byte digest", () => {
    expect(hashAccessToken("any-raw-token-value")).toHaveLength(32);
  });

  it("is deterministic: same raw token -> same hash", () => {
    const raw = "fixed-fixture-token-value-for-determinism-check";
    expect(Buffer.from(hashAccessToken(raw))).toEqual(Buffer.from(hashAccessToken(raw)));
  });

  it("produces different hashes for different raw tokens", () => {
    const a = hashAccessToken("fixture-token-a");
    const b = hashAccessToken("fixture-token-b");
    expect(Buffer.from(a)).not.toEqual(Buffer.from(b));
  });

  it("matches the known SHA-256 test vector for 'abc'", () => {
    const digest = Buffer.from(hashAccessToken("abc")).toString("hex");
    expect(digest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("isValidRawAccessTokenShape", () => {
  it("accepts a freshly generated token", () => {
    const { rawToken } = generateAccessToken();
    expect(isValidRawAccessTokenShape(rawToken)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidRawAccessTokenShape("")).toBe(false);
  });

  it("rejects whitespace", () => {
    expect(isValidRawAccessTokenShape("   ")).toBe(false);
    expect(isValidRawAccessTokenShape("a".repeat(42) + " ")).toBe(false);
  });

  it("rejects a token shorter than 43 characters", () => {
    expect(isValidRawAccessTokenShape("a".repeat(42))).toBe(false);
  });

  it("rejects a token longer than 43 characters", () => {
    expect(isValidRawAccessTokenShape("a".repeat(44))).toBe(false);
  });

  it("rejects a token containing '=' padding", () => {
    expect(isValidRawAccessTokenShape("a".repeat(42) + "=")).toBe(false);
  });

  it("rejects characters outside the base64url alphabet", () => {
    expect(isValidRawAccessTokenShape("a".repeat(42) + "+")).toBe(false);
    expect(isValidRawAccessTokenShape("a".repeat(42) + "/")).toBe(false);
    expect(isValidRawAccessTokenShape("a".repeat(42) + "!")).toBe(false);
  });

  it("accepts a token using both '-' and '_' (base64url-specific characters)", () => {
    expect(isValidRawAccessTokenShape("-".repeat(21) + "_".repeat(22))).toBe(true);
  });
});
