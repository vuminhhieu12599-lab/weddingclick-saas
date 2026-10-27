import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { resolveShowroomContact } from "../../../lib/showroom/showroom-contact";
import { FloatingContact, WEDDINGCLICK_MESSENGER_URL } from "../floating-contact";

/**
 * WC-SHOWROOM-CONTACT-01 — the floating Zalo / Messenger buttons on the public
 * showroom. The Zalo channel itself (normalization, "not configured") is
 * covered by showroom-pricing-contact.test.ts and its module is unchanged;
 * this file covers only the two buttons, where they mount and how they behave.
 */
const CONFIGURED = resolveShowroomContact({ WEDDINGCLICK_CONTACT_ZALO_PHONE: "0901 234 567" });
const UNCONFIGURED = resolveShowroomContact({});
const render = (contact = CONFIGURED) => renderToStaticMarkup(<FloatingContact contact={contact} />);

describe("WC-SHOWROOM-CONTACT-01 the two buttons", () => {
  it("Zalo reuses the one configured business link, never a second copy of the number", () => {
    const html = render();
    expect(CONFIGURED.zalo?.href).toBe("https://zalo.me/0901234567");
    expect(html).toContain('href="https://zalo.me/0901234567"');
    // The number is in the link and nowhere else: no visible phone text, no duplicate.
    expect(html.match(/0901234567/g)).toHaveLength(1);
    expect(html).not.toContain("0901 234 567");
  });

  it("Messenger links the Product Owner's profile URL verbatim, safely in a new tab", () => {
    expect(WEDDINGCLICK_MESSENGER_URL).toBe("https://www.facebook.com/profile.php?id=61582288501879");
    const html = render();
    expect(html).toContain(`href="${WEDDINGCLICK_MESSENGER_URL}"`);
    // No invented m.me deep link, and nothing claims the profile opens a chat thread.
    expect(html).not.toMatch(/m\.me|messenger\.com/);
    expect(html).not.toMatch(/nhắn tin|chat ngay/i);
    expect(html.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(2);
  });

  it("accessible labels name each channel, and the marks themselves are decorative", () => {
    const html = render();
    expect(html).toContain('aria-label="Liên hệ qua Zalo"');
    expect(html).toContain('aria-label="Liên hệ qua Messenger"');
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
  });

  it("no configured Zalo number → no Zalo button, and Messenger still stands alone", () => {
    expect(UNCONFIGURED.zalo).toBeNull();
    const html = render(UNCONFIGURED);
    expect(html).not.toMatch(/zalo\.me|Liên hệ qua Zalo/);
    expect(html).toContain(`href="${WEDDINGCLICK_MESSENGER_URL}"`);
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("is server-rendered and brings no chat SDK, timer or tracking script", () => {
    const code = readFileSync(join(__dirname, "..", "floating-contact.tsx"), "utf8");
    expect(code).not.toMatch(/"use client"|useState|useEffect|setInterval|setTimeout|<script|fbq|gtag|connect\.facebook\.net|zalo\.sdk/);
  });
});

describe("WC-SHOWROOM-CONTACT-01 placement", () => {
  const css = readFileSync(join(__dirname, "..", "floating-contact.module.css"), "utf8");

  it("sits in the bottom-right corner inside the safe areas, with 50px touch targets", () => {
    expect(css).toMatch(/\.dock \{[^}]*position: fixed;/);
    expect(css).toMatch(/right: calc\(16px \+ env\(safe-area-inset-right, 0px\)\);/);
    expect(css).toMatch(/bottom: calc\(16px \+ env\(safe-area-inset-bottom, 0px\)\);/);
    expect(css).toMatch(/\.button \{[^}]*width: 50px;\s*height: 50px;/);
    // Nothing is positioned off the right edge, so no page can overflow sideways.
    expect(css).not.toMatch(/right:\s*-|left:\s*100/);
  });

  it("stays under the showroom header, the mobile menu and every invitation overlay", () => {
    const z = /z-index: (\d+);/.exec(css)?.[1];
    expect(Number(z)).toBeLessThan(50); // mobile menu panel
    expect(Number(z)).toBeLessThan(90); // Se Duyên lightbox, the lowest invitation overlay
    // Native <dialog> modals render in the top layer, so no z-index can cover them.
  });

  it("the attention motion is automatic only without a reduced-motion preference", () => {
    const noPreference = /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(noPreference).toMatch(/animation: sr-contact-wiggle 9s ease-in-out 3s infinite;/);
    // The only `animation` declaration in the file is inside that block.
    expect(css.replace(noPreference, "")).not.toMatch(/\banimation:/);
    // It wiggles briefly and then rests: the movement ends at 7.5% of a 9s cycle.
    expect(css).toMatch(/7\.5% \{\s*rotate: 0deg;\s*scale: 1;/);
    // Hover and press answer the visitor's own action, so they stay.
    expect(css).toMatch(/\.button:active \{\s*transform: scale\(0\.94\);/);
  });
});

describe("WC-SHOWROOM-CONTACT-01 page scope", () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, "..", "..", ...parts), "utf8");

  it("the showroom shell mounts it beside its root, so the homepage and /tu-van carry it", () => {
    const shell = read("_showroom", "site-chrome.tsx");
    expect(shell).toMatch(/<\/div>\s*<FloatingContact contact=\{contact\} \/>\s*<\/>/);
  });

  it("the demo pages mount it outside the invitation renderer, which is untouched", () => {
    const demo = read("mau-thiep", "_components", "demo-view.tsx");
    expect(demo).toMatch(/<\/div>\s*<FloatingContact contact=\{contact\} \/>\s*<\/>/);
    expect(demo.indexOf("<DemoInvitationRenderer")).toBeLessThan(demo.indexOf("<FloatingContact"));
  });

  it("exactly two files import it: no invitation, Staff, Portal or Review surface does", () => {
    const appDir = join(__dirname, "..", "..");
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== "__tests__") walk(full);
        } else if (/\.tsx?$/.test(entry.name) && /from "[^"]*floating-contact"/.test(readFileSync(full, "utf8"))) {
          importers.push(relative(appDir, full));
        }
      }
    };
    walk(appDir);
    expect(importers.sort()).toStrictEqual(["_showroom/site-chrome.tsx", join("mau-thiep", "_components", "demo-view.tsx")].sort());
  });
});
