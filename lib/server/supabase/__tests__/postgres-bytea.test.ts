import { describe, expect, it } from "vitest";

import { toPostgresByteaHexLiteral } from "../postgres-bytea";

describe("toPostgresByteaHexLiteral", () => {
  it("serializes a known byte sequence to the \\x-prefixed lowercase hex literal", () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(toPostgresByteaHexLiteral(bytes)).toBe("\\xdeadbeef");
  });

  it("serializes an empty byte array to the bare prefix", () => {
    expect(toPostgresByteaHexLiteral(new Uint8Array([]))).toBe("\\x");
  });

  it("serializes a 32-byte all-zero digest", () => {
    const bytes = new Uint8Array(32);
    expect(toPostgresByteaHexLiteral(bytes)).toBe(`\\x${"00".repeat(32)}`);
  });

  it("serializes a 32-byte all-0xff digest", () => {
    const bytes = new Uint8Array(32).fill(0xff);
    expect(toPostgresByteaHexLiteral(bytes)).toBe(`\\x${"ff".repeat(32)}`);
  });

  it("always produces lowercase hex, never uppercase", () => {
    const bytes = new Uint8Array([0xab, 0xcd, 0xef]);
    const result = toPostgresByteaHexLiteral(bytes);
    expect(result).toBe(result.toLowerCase());
  });

  it("produces exactly one leading backslash followed by 'x'", () => {
    const bytes = new Uint8Array([0x01]);
    const result = toPostgresByteaHexLiteral(bytes);
    expect(result.startsWith("\\x")).toBe(true);
    expect(result.startsWith("\\\\")).toBe(false);
  });
});
