import { afterEach, describe, expect, it, vi } from "vitest";

import { renderToStaticMarkupAsync } from "../../../templates/core/__tests__/support/render-static-markup";
import { SHOWROOM_TEMPLATE_ENTRIES, type ShowroomTemplateEntry } from "../../../lib/showroom/showroom-catalog";
import { DEMO_RSVP_CAPABILITY } from "../../mau-thiep/_components/demo-invitation-renderer";
import { TemplateShowcase } from "../template-showcase";

const FIFTH: ShowroomTemplateEntry = {
  ...(SHOWROOM_TEMPLATE_ENTRIES[0] as ShowroomTemplateEntry),
  templateCode: "fixture-five",
  nameVi: "Mẫu Thứ Năm",
  nameEn: "Fixture Template Five",
  // SD-V1-SHOWROOM-01: Se Duyên took sortOrder 50, so the fixture sits after it.
  sortOrder: 60,
};

function countCards(html: string): number {
  return html.match(/<article\b/g)?.length ?? 0;
}

describe("LAUNCH-P0-04 showroom collection is data-driven", () => {
  it("renders one card per catalog entry: the released set, one more with a fixture, no JSX change", async () => {
    // SD-V1-SHOWROOM-01: counted from the catalog, so adding a template stays
    // one new entry in `SHOWROOM_TEMPLATE_ENTRIES` and no JSX or test edit.
    const released = SHOWROOM_TEMPLATE_ENTRIES.length;
    const listed = await renderToStaticMarkupAsync(<TemplateShowcase templates={SHOWROOM_TEMPLATE_ENTRIES} />);
    expect(countCards(listed)).toBe(released);
    const withExtra = await renderToStaticMarkupAsync(<TemplateShowcase templates={[...SHOWROOM_TEMPLATE_ENTRIES, FIFTH]} />);
    expect(countCards(withExtra)).toBe(released + 1);
    expect(withExtra).toContain("Mẫu Thứ Năm");
    expect(withExtra).toContain('href="/mau-thiep/fixture-five"');
    expect(withExtra).toContain('href="/tu-van?mau=fixture-five"');
    expect(withExtra).toContain(`${released + 1} mẫu thiệp đang có`);
  });

  it("each card links its own demo and its own selection", async () => {
    const html = await renderToStaticMarkupAsync(<TemplateShowcase templates={SHOWROOM_TEMPLATE_ENTRIES} />);
    for (const template of SHOWROOM_TEMPLATE_ENTRIES) {
      expect(html).toContain(`href="/mau-thiep/${template.templateCode}"`);
      expect(html).toContain(`href="/tu-van?mau=${template.templateCode}"`);
      expect(html).toContain(template.nameVi);
    }
  });

  it("zero templates → calm empty state with a consultation link, no cards", async () => {
    const html = await renderToStaticMarkupAsync(<TemplateShowcase templates={[]} />);
    expect(countCards(html)).toBe(0);
    expect(html).toContain("Bộ sưu tập đang được làm mới");
    expect(html).toContain('href="/tu-van"');
  });
});

describe("LAUNCH-P0-04 demo RSVP never sends or persists", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("always resolves UNAVAILABLE without any network request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await DEMO_RSVP_CAPABILITY.submit({ attendance: "ATTENDING", partySize: 2, message: "Chúc mừng", guestName: "Khách thử" });
    expect(result).toStrictEqual({ status: "UNAVAILABLE" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
