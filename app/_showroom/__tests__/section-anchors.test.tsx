import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SHOWROOM_SECTION_IDS } from "../../../lib/showroom/showroom-routes";
import { SectionLink } from "../section-link";

// `next/font` cannot run here; the shell only needs the class name it exports.
vi.mock("../showroom-fonts", () => ({ SHOWROOM_FONT_VARIABLES_CLASS_NAME: "sr-test-fonts" }));

const { SiteFooter, SiteHeader } = await import("../site-chrome");

/**
 * WC-SHOWROOM-NAV-01 — links into a homepage section must be native anchors.
 *
 * Through `next/link` they were a no-op once the URL already carried the
 * target hash: the first click scrolled, every later one did nothing. The
 * browser's own fragment navigation always scrolls, so these links are plain
 * `<a>`. Links that can never be same-page keep `next/link`.
 */
const SECTION_HREFS = Object.values(SHOWROOM_SECTION_IDS).map((id) => `/#${id}`);
const source = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");

describe("WC-SHOWROOM-NAV-01 SectionLink", () => {
  it("is a plain anchor with its href, class and children, and imports no router link", () => {
    const html = renderToStaticMarkup(
      <SectionLink href="/#mau-thiep" className="x">
        Mẫu thiệp
      </SectionLink>,
    );
    expect(html).toBe('<a href="/#mau-thiep" class="x">Mẫu thiệp</a>');
    expect(renderToStaticMarkup(<SectionLink href="/#loi-ich">Tính năng</SectionLink>)).toBe('<a href="/#loi-ich">Tính năng</a>');
    // The comment explains why it is not a router link; the code imports none.
    const code = source("section-link.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/next\/link/);
  });
});

describe("WC-SHOWROOM-NAV-01 every homepage section link is native", () => {
  it("no `/#` href is wrapped in a router Link in the shell or the home sections", () => {
    for (const file of ["site-chrome.tsx", "home-sections.tsx"]) {
      const code = source(file);
      // A `<Link …>` opening tag whose href is a homepage fragment: none may remain.
      expect(/<Link[^>]*href=\{?[`"']?\/#/.test(code), file).toBe(false);
      expect(/<Link[^>]*href=\{(?:item\.href|SHOWROOM_TEMPLATES_HREF)\}/.test(code), file).toBe(false);
    }
  });

  it("the header renders each section link as an anchor, in the desktop nav and the mobile menu", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    for (const href of [`/#${SHOWROOM_SECTION_IDS.templates}`, `/#${SHOWROOM_SECTION_IDS.benefits}`, `/#${SHOWROOM_SECTION_IDS.pricing}`, `/#${SHOWROOM_SECTION_IDS.contact}`]) {
      // Once in the desktop nav and once in the <details> menu panel.
      expect(html.match(new RegExp(`<a href="${href}"`, "g")), href).toHaveLength(2);
    }
  });

  it("the footer renders its section links as anchors, including the process link", () => {
    const html = renderToStaticMarkup(<SiteFooter contact={{ zalo: null, hotline: null }} />);
    for (const href of [`/#${SHOWROOM_SECTION_IDS.templates}`, `/#${SHOWROOM_SECTION_IDS.benefits}`, `/#${SHOWROOM_SECTION_IDS.pricing}`, `/#${SHOWROOM_SECTION_IDS.process}`]) {
      expect(html, href).toContain(`<a href="${href}"`);
    }
  });

  it("every section id the links point at is a real id, and the sticky-header offset is kept", () => {
    const rendered = source("home-sections.tsx") + source("template-showcase.tsx");
    for (const href of SECTION_HREFS) {
      const id = href.slice(2);
      const key = Object.entries(SHOWROOM_SECTION_IDS).find(([, value]) => value === id)?.[0] ?? "";
      expect(rendered, id).toContain(`id={SHOWROOM_SECTION_IDS.${key}}`);
    }
    // Native fragment navigation honours `scroll-margin-top`, so the header never hides a heading.
    expect(source("showroom.module.css")).toMatch(/scroll-margin-top: 72px;/);
  });
});
