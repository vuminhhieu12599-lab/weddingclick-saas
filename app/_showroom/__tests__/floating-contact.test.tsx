import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FloatingContact, WEDDINGCLICK_FACEBOOK_URL } from "../floating-contact";

/**
 * WC-SHOWROOM-CONTACT-04 — the floating contact button on the public showroom.
 * One button, the WeddingClick Facebook page: the Zalo button is withdrawn
 * until there is a Zalo Official Account, and the configured number itself is
 * untouched, which showroom-pricing-contact.test.ts still covers.
 */
const render = () => renderToStaticMarkup(<FloatingContact />);

describe("WC-SHOWROOM-CONTACT-04 the Facebook button", () => {
  it("links the WeddingClick page verbatim, safely in a new tab", () => {
    expect(WEDDINGCLICK_FACEBOOK_URL).toBe("https://www.facebook.com/profile.php?id=61582288501879");
    const html = render();
    expect(html).toContain(`href="${WEDDINGCLICK_FACEBOOK_URL}"`);
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    // One button in the dock, and its mark is decorative.
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(1);
  });

  it("names the page, and never promises a Messenger conversation", () => {
    const html = render();
    expect(html).toContain('aria-label="Xem Facebook WeddingClick"');
    expect(html).not.toMatch(/m\.me|messenger|nhắn tin|chat/i);
  });

  it("the Zalo button is gone, with no hidden anchor and no leftover link logic", () => {
    const html = render();
    expect(html).not.toMatch(/zalo/i);
    // The comments still explain why the Zalo button is withdrawn; the code itself has nothing left of it.
    const code = readFileSync(join(__dirname, "..", "floating-contact.tsx"), "utf8");
    const executable = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(executable).not.toMatch(/zalo|ShowroomContact/i);
    const css = readFileSync(join(__dirname, "..", "floating-contact.module.css"), "utf8");
    expect(css).not.toMatch(/zalo|messenger|hover: none/i);
  });

  it("is server-rendered and brings no chat SDK, timer or tracking script", () => {
    const code = readFileSync(join(__dirname, "..", "floating-contact.tsx"), "utf8");
    expect(code).not.toMatch(/"use client"|useState|useEffect|setInterval|setTimeout|<script|fbq|gtag|connect\.facebook\.net/);
  });
});

describe("WC-SHOWROOM-CONTACT-04 placement", () => {
  const css = readFileSync(join(__dirname, "..", "floating-contact.module.css"), "utf8");

  it("sits in the bottom-right corner inside the safe areas, with a 50px touch target", () => {
    expect(css).toMatch(/\.dock \{[^}]*position: fixed;/);
    expect(css).toMatch(/right: calc\(16px \+ env\(safe-area-inset-right, 0px\)\);/);
    expect(css).toMatch(/bottom: calc\(16px \+ env\(safe-area-inset-bottom, 0px\)\);/);
    expect(css).toMatch(/\.button \{[^}]*width: 50px;\s*height: 50px;/);
    // The shadow and the round shape are unchanged.
    expect(css).toMatch(/\.button \{[^}]*border-radius: 50%;/);
    expect(css).toMatch(/\.button \{[^}]*box-shadow:/);
    expect(css).not.toMatch(/right:\s*-|left:\s*100/);
  });

  it("stays under the showroom header, the mobile menu and every invitation overlay", () => {
    const z = /z-index: (\d+);/.exec(css)?.[1];
    expect(Number(z)).toBeLessThan(50); // mobile menu panel
    expect(Number(z)).toBeLessThan(90); // Se Duyên lightbox, the lowest invitation overlay
    // Native <dialog> modals render in the top layer, so no z-index can cover them.
  });

  it("still wiggles every three seconds, and only without a reduced-motion preference", () => {
    const noPreference = /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(noPreference).toMatch(/\.button \{\s*animation: sr-contact-wiggle 3s ease-in-out 1s infinite;/);
    // The only `animation` declaration in the file is inside that block, so `reduce` gets none.
    expect(css.replace(noPreference, "")).not.toMatch(/\banimation:/);
    // It moves for the first 14% of the cycle (0.42s) and is still for the other 2.58s.
    expect(css).toMatch(/14%,\n\s*100% \{\s*rotate: 0deg;\s*scale: 1;/);
    // Restrained: no rotation past 8deg and no scale past 1.05.
    const rotations = [...css.matchAll(/rotate: (-?[\d.]+)deg;/g)].map((m) => Math.abs(Number(m[1])));
    expect(Math.max(...rotations)).toBeLessThanOrEqual(8);
    const scales = [...css.matchAll(/scale: ([\d.]+);/g)].map((m) => Number(m[1]));
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.05);
    // Hover and press answer the visitor's own action, so they stay.
    expect(css).toMatch(/\.button:active \{\s*transform: scale\(0\.94\);/);
  });
});

describe("WC-SHOWROOM-CONTACT-04 page scope", () => {
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

  it("the demo pages mount it outside the invitation renderer, which is untouched", () => {
    const demo = readFileSync(join(__dirname, "..", "..", "mau-thiep", "_components", "demo-view.tsx"), "utf8");
    expect(demo).toMatch(/<\/div>\s*<FloatingContact \/>\s*<\/>/);
    expect(demo.indexOf("<DemoInvitationRenderer")).toBeLessThan(demo.indexOf("<FloatingContact"));
  });
});
