import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Task 030 Duyệt tab runtime regression: the real admin-api-client review
 * functions are callable named exports and reach the expected staff routes
 * with the staff Bearer token (no mocking of the module under test).
 */

vi.mock("../staff-session-client", () => ({ getStaffAccessToken: async () => "staff-jwt" }));
vi.mock("../signed-media-upload", () => ({ uploadToSignedMediaPath: vi.fn() }));

const client = await import("../admin-api-client");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return calls;
}

describe("admin-api-client review functions", () => {
  it("fetchProjectReviewState is a callable export that GETs the staff review read model", async () => {
    expect(typeof client.fetchProjectReviewState).toBe("function");
    const calls = stubFetch({ data: { projectId: PROJECT_ID, variants: [] } });
    const state = await client.fetchProjectReviewState(PROJECT_ID);
    expect(state).toEqual({ projectId: PROJECT_ID, variants: [] });
    expect(calls[0].url).toBe(`/api/v2/internal/projects/${PROJECT_ID}/review`);
    expect(new Headers(calls[0].init?.headers).get("authorization")).toBe("Bearer staff-jwt");
  });

  it("issueReviewAccessLink is a callable export that POSTs a REVIEW link request", async () => {
    expect(typeof client.issueReviewAccessLink).toBe("function");
    const calls = stubFetch({ data: { id: "l1", token: "raw" } }, 201);
    expect(await client.issueReviewAccessLink(PROJECT_ID)).toEqual({ id: "l1", token: "raw" });
    expect(calls[0].url).toBe(`/api/v2/internal/projects/${PROJECT_ID}/access-links`);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ linkType: "REVIEW" });
  });
});
