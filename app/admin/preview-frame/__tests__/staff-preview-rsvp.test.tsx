import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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
const { StaffPreviewRenderer } = await import("../staff-preview-renderer");

/** Staff Preview RSVP (P30 amendment): visible for review, submission honestly UNAVAILABLE, nothing written. A no-guest scenario mirrors the staff preview ViewModel (no guest context). */

const data = await buildHarnessRenderData("lunar-null");
const html = renderToStaticMarkup(
  <StaffPreviewRenderer rendererKey={data.rendererKey} viewModel={data.viewModel} sections={data.sections} />,
);

function rsvpBlock(): string {
  const start = html.indexOf("Xác nhận tham dự");
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</form>", start));
}

describe("Staff Preview RSVP rendering", () => {
  it("renders the RSVP section with its form", () => {
    expect(rsvpBlock()).toContain("Gửi lời chúc");
  });

  it("offers exactly ATTENDING / MAYBE / NOT_ATTENDING in order", () => {
    const block = rsvpBlock();
    const labels = ["Sẽ tham dự", "Sẽ cố gắng tham dự", "Tiếc quá, không tham dự được"];
    const positions = labels.map((label) => block.indexOf(label));
    expect(positions.every((position) => position > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(block.match(/<option[^>]*value="(ATTENDING|MAYBE|NOT_ATTENDING)"/g)).toHaveLength(3);
  });

  it("the name input starts blank and no guest identity is present", () => {
    expect(data.viewModel.guest).toBeUndefined();
    const nameInputs = rsvpBlock().match(/<input[^>]*type="text"[^>]*>/g) ?? [];
    expect(nameInputs.length).toBeGreaterThan(0);
    for (const input of nameInputs) expect(input).not.toMatch(/value="[^"]+"/);
  });

  it("never shows a success message before any submission", () => {
    expect(html).not.toMatch(/Cảm ơn bạn đã xác nhận|Đã gửi thành công/);
  });
});

describe("Staff Preview RSVP capability", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a valid submission resolves UNAVAILABLE and performs no network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    let captured: { submit: (input: unknown) => Promise<unknown> } | undefined;
    vi.doMock("../../../../templates/core/client/invitation-renderer-host-core", () => ({
      InvitationRendererHostCore: (props: { rsvp?: { submit: (input: unknown) => Promise<unknown> } }) => {
        captured = props.rsvp;
        return null;
      },
    }));
    vi.resetModules();
    const { StaffPreviewRenderer: Wrapper } = await import("../staff-preview-renderer");
    renderToStaticMarkup(<Wrapper rendererKey={data.rendererKey} viewModel={data.viewModel} sections={data.sections} />);
    expect(captured).toBeDefined();
    const result = await captured?.submit({ attendance: "ATTENDING", partySize: 2, message: null, guestName: "Anh Hiếu" });
    expect(result).toEqual({ status: "UNAVAILABLE" });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.doUnmock("../../../../templates/core/client/invitation-renderer-host-core");
  });
});
