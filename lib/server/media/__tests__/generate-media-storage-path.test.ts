import { describe, expect, it } from "vitest";

import {
  canonicalizeProjectId,
  generateMediaStoragePath,
} from "../generate-media-storage-path";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("canonicalizeProjectId", () => {
  it("lowercases the project id", () => {
    expect(canonicalizeProjectId("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")).toBe(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
  });

  it("leaves an already-lowercase id unchanged", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(canonicalizeProjectId(id)).toBe(id);
  });
});

describe("generateMediaStoragePath", () => {
  const projectId = "11111111-1111-1111-1111-111111111111";

  it("generates a path of exactly <projectId>/<uuid>", () => {
    const path = generateMediaStoragePath(projectId);
    const [first, second, ...rest] = path.split("/");

    expect(rest).toHaveLength(0);
    expect(first).toBe(projectId);
    expect(second).toMatch(UUID_PATTERN);
  });

  it("never includes a file extension or client-controlled material", () => {
    const path = generateMediaStoragePath(projectId);
    expect(path).not.toMatch(/\.[a-zA-Z0-9]+$/);
  });

  it("generates a fresh, distinct path on every call", () => {
    const first = generateMediaStoragePath(projectId);
    const second = generateMediaStoragePath(projectId);
    expect(first).not.toBe(second);
  });
});
