import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/font loaders only run under the Next compiler (same mock as the renderer tests).
// VH-01: the production binding registry also binds Vietnamese Heritage v1, whose
// next/font loaders only run under the Next compiler.
vi.mock("../../../../templates/wedding/vietnamese-heritage/v1/fonts", () => ({
  VIETNAMESE_HERITAGE_V1_FONT_VARIABLES_CLASS_NAME: "vh-test-font-variables",
}));
vi.mock("../../../../templates/wedding/elegant-editorial/v1/fonts", () => ({
  ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables",
}));

const { buildHarnessRenderData } = await import("../../../internal/renderer-harness/harness-scenarios");
const { PublicInvitationRenderer, createPublicRsvpCapability } = await import("../public-invitation-renderer");

/** Task 033A: the public /i/[slug] wrapper supplies the REAL RSVP capability; SUCCESS only after a confirmed 201. */

const SLUG = "an-va-binh-k3x9";
const VALID = { attendance: "MAYBE", partySize: 3, message: null, guestName: "Em và sự cô đơn" } as const;

function fetchReturning(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("A: the public RSVP section renders with the real capability", () => {
  it("shows the form with three canonical choices and a blank name input", async () => {
    const data = await buildHarnessRenderData("lunar-null");
    const html = renderToStaticMarkup(
      <PublicInvitationRenderer publicSlug={SLUG} rendererKey={data.rendererKey} viewModel={data.viewModel} sections={data.sections} />,
    );
    const start = html.indexOf("Xác nhận tham dự");
    expect(start).toBeGreaterThan(-1);
    const block = html.slice(start, html.indexOf("</form>", start));
    expect(block.match(/<option[^>]*value="(ATTENDING|MAYBE|NOT_ATTENDING)"/g)).toHaveLength(3);
    for (const input of block.match(/<input[^>]*type="text"[^>]*>/g) ?? []) expect(input).not.toMatch(/value="[^"]+"/);
    expect(html).not.toMatch(/Cảm ơn bạn đã xác nhận|Đã gửi thành công/);
  });
});

describe("public RSVP capability", () => {
  it("posts exactly slug + four canonical fields, no identity, no cookies; 201 recorded → SUCCESS", async () => {
    const f = fetchReturning(201, { data: { recorded: true } });
    expect(await createPublicRsvpCapability(SLUG, f.impl).submit(VALID)).toEqual({ status: "SUCCESS" });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe("/api/v2/public/rsvp");
    expect(f.calls[0].init.method).toBe("POST");
    expect(f.calls[0].init.credentials).toBe("omit");
    expect(JSON.parse(String(f.calls[0].init.body))).toStrictEqual({ publicSlug: SLUG, ...VALID });
  });

  it.each([
    [400, { error: "Invalid RSVP request" }, "INVALID"],
    [404, { error: "Invitation not found" }, "UNAVAILABLE"],
    [500, { error: "Internal server error" }, "FAILED"],
    [201, { data: {} }, "FAILED"],
    [200, { data: { recorded: true } }, "FAILED"],
  ])("HTTP %i %j → %s (never a fake SUCCESS)", async (status, body, expected) => {
    expect(await createPublicRsvpCapability(SLUG, fetchReturning(status, body).impl).submit(VALID)).toEqual({ status: expected });
  });

  it("a network failure resolves FAILED; invalid input resolves INVALID without any request", async () => {
    const throwing = (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    expect(await createPublicRsvpCapability(SLUG, throwing).submit(VALID)).toEqual({ status: "FAILED" });
    const f = fetchReturning(201, { data: { recorded: true } });
    const bad = { ...VALID, guestName: "  " };
    expect(await createPublicRsvpCapability(SLUG, f.impl).submit(bad)).toEqual({ status: "INVALID" });
    expect(f.calls).toHaveLength(0);
  });
});
