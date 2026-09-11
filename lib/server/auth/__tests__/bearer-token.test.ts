import { describe, expect, it } from "vitest";

import { parseBearerToken } from "../bearer-token";

describe("parseBearerToken", () => {
  it("accepts a normal Bearer token", () => {
    expect(parseBearerToken("Bearer abc123.def456")).toBe("abc123.def456");
  });

  it("rejects a missing Authorization header (null)", () => {
    expect(parseBearerToken(null)).toBeNull();
  });

  it("rejects a missing Authorization header (undefined)", () => {
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it("rejects the wrong authentication scheme", () => {
    expect(parseBearerToken("Basic abc123")).toBeNull();
  });

  it("rejects a lowercase scheme (exact 'Bearer ' prefix required)", () => {
    expect(parseBearerToken("bearer abc123")).toBeNull();
  });

  it("rejects an empty Bearer value", () => {
    expect(parseBearerToken("Bearer ")).toBeNull();
  });

  it("rejects a Bearer value that is only whitespace", () => {
    expect(parseBearerToken("Bearer    ")).toBeNull();
  });

  it("rejects an empty string header", () => {
    expect(parseBearerToken("")).toBeNull();
  });

  it("trims surrounding whitespace from the token", () => {
    expect(parseBearerToken("Bearer   abc123  ")).toBe("abc123");
  });
});
