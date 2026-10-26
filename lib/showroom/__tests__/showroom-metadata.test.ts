import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

// next/font loaders only run under the Next compiler (same mock as the renderer tests).
vi.mock("../../../app/_showroom/showroom-fonts", () => ({
  SHOWROOM_FONT_VARIABLES_CLASS_NAME: "sr-test-font-variables",
}));

import { SHOWROOM_SOCIAL_IMAGE, SHOWROOM_SOCIAL_IMAGE_PATH } from "../showroom-metadata";
import {
  DEFAULT_SHOWROOM_SITE_URL,
  RETIRED_SHOWROOM_HOSTS,
  SHOWROOM_SITE_URL,
  resolveShowroomSiteUrl,
  showroomAbsoluteUrl,
} from "../showroom-site-url";

const { metadata: homeMetadata } = await import("../../../app/page");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");

/** Width and height from a JPEG's first SOF marker, or `null` if not a JPEG. */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] as number;
    const length = bytes.readUInt16BE(offset + 2);
    // SOF0..SOF15, excluding the non-frame markers DHT (c4), JPG (c8) and DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

describe("WC-PROD-REVIEW-01 showroom public base URL", () => {
  it("falls back to a reachable HTTPS origin when the variable is unset, empty or not a URL", () => {
    for (const raw of [undefined, "", "   ", "not a url", "weddingclick.vercel.app"]) {
      expect(resolveShowroomSiteUrl(raw).toString(), String(raw)).toBe(`${DEFAULT_SHOWROOM_SITE_URL}/`);
    }
  });

  it("honours a configured HTTPS origin and strips any path, query or fragment", () => {
    expect(resolveShowroomSiteUrl("https://weddingclick.vn").toString()).toBe("https://weddingclick.vn/");
    expect(resolveShowroomSiteUrl("  https://www.weddingclick.vn/mau-thiep?a=1#b  ").toString()).toBe("https://www.weddingclick.vn/");
  });

  it("refuses plain HTTP: a crawler will not load a mixed-content image", () => {
    expect(resolveShowroomSiteUrl("http://weddingclick.vn").toString()).toBe(`${DEFAULT_SHOWROOM_SITE_URL}/`);
  });

  it("refuses the retired domain even if it is configured again", () => {
    for (const host of RETIRED_SHOWROOM_HOSTS) {
      expect(resolveShowroomSiteUrl(`https://${host}`).toString(), host).toBe(`${DEFAULT_SHOWROOM_SITE_URL}/`);
    }
  });

  it("the resolved base and the default are HTTPS origins with no path", () => {
    for (const url of [SHOWROOM_SITE_URL, new URL(DEFAULT_SHOWROOM_SITE_URL)]) {
      expect(url.protocol).toBe("https:");
      expect(url.pathname).toBe("/");
      expect(url.search).toBe("");
    }
  });

  it("never points at a retired host, and the default is not a per-deployment URL", () => {
    expect(RETIRED_SHOWROOM_HOSTS).toContain(new URL("https://www.weddingclick.online").hostname);
    expect(RETIRED_SHOWROOM_HOSTS).not.toContain(SHOWROOM_SITE_URL.hostname);
    // `*-<hash>-<scope>.vercel.app` deployment URLs sit behind Vercel SSO.
    expect(new URL(DEFAULT_SHOWROOM_SITE_URL).hostname).not.toMatch(/-[a-z0-9]{8,}-/);
  });
});

describe("WC-PROD-REVIEW-01 showroom social share image", () => {
  it("is declared as an absolute HTTPS URL on the configured base", () => {
    const url = new URL(SHOWROOM_SOCIAL_IMAGE.url);
    expect(url.protocol).toBe("https:");
    expect(url.origin).toBe(SHOWROOM_SITE_URL.origin);
    expect(url.pathname).toBe(SHOWROOM_SOCIAL_IMAGE_PATH);
    expect(SHOWROOM_SOCIAL_IMAGE.url).toBe(showroomAbsoluteUrl(SHOWROOM_SOCIAL_IMAGE_PATH));
  });

  it("names a committed JPEG whose real pixels match the declared width and height", () => {
    const bytes = readFileSync(path.join(REPO_ROOT, "public", SHOWROOM_SOCIAL_IMAGE_PATH));
    expect(jpegSize(bytes)).toStrictEqual({ width: SHOWROOM_SOCIAL_IMAGE.width, height: SHOWROOM_SOCIAL_IMAGE.height });
    expect(SHOWROOM_SOCIAL_IMAGE.type).toBe("image/jpeg");
    // 1200×630 is the ratio Messenger and Zalo render as a large card.
    expect([SHOWROOM_SOCIAL_IMAGE.width, SHOWROOM_SOCIAL_IMAGE.height]).toStrictEqual([1200, 630]);
  });
});

describe("WC-PROD-REVIEW-01 homepage sharing metadata", () => {
  it("declares the base, canonical and Open Graph URL on the configured origin", () => {
    expect(homeMetadata.metadataBase?.toString()).toBe(SHOWROOM_SITE_URL.toString());
    expect(homeMetadata.alternates?.canonical).toBe("/");
    expect(homeMetadata.openGraph?.url).toBe(SHOWROOM_SITE_URL.toString());
  });

  it("carries a non-empty title and description on both Open Graph and Twitter", () => {
    const openGraph = homeMetadata.openGraph as { title?: string; description?: string; siteName?: string; type?: string };
    const twitter = homeMetadata.twitter as { card?: string; title?: string; description?: string; images?: readonly string[] };
    for (const value of [openGraph.title, openGraph.description, twitter.title, twitter.description]) {
      expect(typeof value === "string" && value.trim().length > 0).toBe(true);
    }
    expect(openGraph.type).toBe("website");
    expect(openGraph.siteName).toBe("WeddingClick");
    expect(twitter.card).toBe("summary_large_image");
  });

  it("uses the absolute share image for Open Graph and Twitter alike", () => {
    const images = (homeMetadata.openGraph as { images?: readonly { url: string; width: number; height: number }[] }).images ?? [];
    expect(images).toHaveLength(1);
    expect(images[0]?.url).toBe(SHOWROOM_SOCIAL_IMAGE.url);
    expect(images[0]?.width).toBe(1200);
    expect(images[0]?.height).toBe(630);
    expect((homeMetadata.twitter as { images?: readonly string[] }).images).toStrictEqual([SHOWROOM_SOCIAL_IMAGE.url]);
  });

  it("no showroom metadata source mentions a retired domain", () => {
    const sources = [
      "app/page.tsx",
      "app/tu-van/page.tsx",
      "lib/showroom/showroom-metadata.ts",
      "next.config.ts",
      "vercel.json",
    ];
    for (const file of sources) {
      const code = readFileSync(path.join(REPO_ROOT, file), "utf8");
      for (const host of RETIRED_SHOWROOM_HOSTS) {
        expect(code.includes(host), `${file} mentions ${host}`).toBe(false);
      }
    }
  });
});
