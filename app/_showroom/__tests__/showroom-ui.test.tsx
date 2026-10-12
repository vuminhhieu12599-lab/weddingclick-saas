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
  sortOrder: 50,
};

function countCards(html: string): number {
  return html.match(/<article\b/g)?.length ?? 0;
}

describe("LAUNCH-P0-04 showroom collection is data-driven", () => {
  it("renders one card per catalog entry: four today, five with a fifth fixture, no JSX change", async () => {
    const four = await renderToStaticMarkupAsync(<TemplateShowcase templates={SHOWROOM_TEMPLATE_ENTRIES} />);
    expect(countCards(four)).toBe(4);
    const five = await renderToStaticMarkupAsync(<TemplateShowcase templates={[...SHOWROOM_TEMPLATE_ENTRIES, FIFTH]} />);
    expect(countCards(five)).toBe(5);
    expect(five).toContain("Mẫu Thứ Năm");
    expect(five).toContain('href="/mau-thiep/fixture-five"');
    expect(five).toContain('href="/tu-van?mau=fixture-five"');
    expect(five).toContain("5 mẫu thiệp đang có");
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
