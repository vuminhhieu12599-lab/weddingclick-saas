import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS } from "../../../lib/domain";
import {
  GIFT_QR_DOWNLOAD_BASE_NAME,
  downloadQrWithFeedback,
} from "../../../lib/invitation-rendering/media-download-feedback";
import type { ResolvedMedia } from "../../../lib/invitation-rendering/invitation-view-model-types";
import type {
  MediaDownloadCapabilityV1,
  MediaDownloadResultV1,
} from "../../../lib/invitation-rendering/renderer-capabilities";
import { extensionForImageBlob } from "../client/media-download-capability";
import { buildRendererFixture } from "../fixtures/renderer-fixture-pipeline";
import { FIXTURE_MEDIA_IDS } from "../fixtures/renderer-fixture-sources";

/**
 * WC-GIFT-QR-01 — saving the wedding-gift QR, across the eight published
 * renderer versions (docs/DECISIONS.md "WC-GIFT-QR-01 …").
 *
 * The browser half (a real cross-origin fetch, a real anchor download, the
 * saved bytes) cannot be exercised without a DOM, and this repository has no
 * DOM test environment; it is covered by the recorded headless-Chrome run in
 * the decision record. What is asserted here is everything that decides
 * WHETHER and WITH WHAT a save is offered: the pure feedback model, the file
 * names, the extension mapping, and each renderer's own markup.
 */

// next/font loaders only run under the Next compiler.
vi.mock("../../wedding/vietnamese-heritage/v1/fonts", () => ({ VIETNAMESE_HERITAGE_V1_FONT_VARIABLES_CLASS_NAME: "vh1-fonts" }));
vi.mock("../../wedding/vietnamese-heritage/v2/fonts", () => ({ VIETNAMESE_HERITAGE_V2_FONT_VARIABLES_CLASS_NAME: "vh2-fonts" }));
vi.mock("../../wedding/elegant-editorial/v1/fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-fonts" }));

const QR: ResolvedMedia = { status: "RESOLVED", mediaId: FIXTURE_MEDIA_IDS.QR_GROOM, url: "https://example.test/a.webp", width: 600, height: 600 };

function capability(result: MediaDownloadResultV1 | "reject" = { status: "SUCCESS" }) {
  const saveImage = vi.fn(async (): Promise<MediaDownloadResultV1> => {
    if (result === "reject") throw new Error("unexpected fault");
    return result;
  });
  return { saveImage } as MediaDownloadCapabilityV1 & { saveImage: ReturnType<typeof vi.fn> };
}

// ---------------------------------------------------------------------------
// A. The saved file: its name, its extension, its bytes
// ---------------------------------------------------------------------------

describe("A: the file a guest ends up with", () => {
  it("is named per family side, and names nothing else", () => {
    expect(GIFT_QR_DOWNLOAD_BASE_NAME).toStrictEqual({ GROOM: "ma-qr-nha-trai", BRIDE: "ma-qr-nha-gai" });
    for (const name of Object.values(GIFT_QR_DOWNLOAD_BASE_NAME)) {
      expect(name).toMatch(/^[a-z-]+$/);
      expect(name).not.toMatch(/http|token|supabase|\d/i);
    }
  });

  it("takes its extension from the bytes actually received, never from an assumption", () => {
    expect(extensionForImageBlob("image/png")).toBe("png");
    expect(extensionForImageBlob("image/jpeg")).toBe("jpg");
    // The admin optimizer emits WebP, so this is the common real case.
    expect(extensionForImageBlob("image/webp")).toBe("webp");
    expect(extensionForImageBlob("IMAGE/WEBP; charset=binary")).toBe("webp");
    // Anything unexpected still names itself an image rather than lying.
    expect(extensionForImageBlob("application/pdf")).toBe("png");
    expect(extensionForImageBlob("")).toBe("png");
  });

  it("the adapter saves the response bytes and never re-encodes them", () => {
    const code = readFileSync(join(__dirname, "..", "client", "media-download-capability.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toMatch(/await response\.blob\(\)/);
    expect(code).toMatch(/URL\.createObjectURL\(blob\)/);
    // No canvas, no image decode, no resize, no re-encode, no proxy.
    expect(code).not.toMatch(/canvas|getContext|toDataURL|toBlob|drawImage|new Image|\/api\/|proxy/i);
    expect(code).toMatch(/credentials: "omit"/);
  });
});

// ---------------------------------------------------------------------------
// B. Failure is never success
// ---------------------------------------------------------------------------

describe("B: the model never reports a save that did not happen", () => {
  it.each([
    ["SUCCESS", { status: "SUCCESS" } as const, "SUCCESS"],
    ["UNAVAILABLE", { status: "UNAVAILABLE" } as const, "UNAVAILABLE"],
    ["FAILED (expired or rejected URL)", { status: "FAILED" } as const, "FAILED"],
  ])("%s passes through", async (_label, result, expected) => {
    expect(await downloadQrWithFeedback(capability(result), QR, "GROOM")).toBe(expected);
  });

  it("a rejection, a malformed result or a missing status is FAILED, never SUCCESS", async () => {
    expect(await downloadQrWithFeedback(capability("reject"), QR, "GROOM")).toBe("FAILED");
    for (const malformed of [undefined, null, {}, { status: "OK" }, { status: "success" }, "SUCCESS"]) {
      const rogue = { saveImage: async () => malformed } as unknown as MediaDownloadCapabilityV1;
      expect(await downloadQrWithFeedback(rogue, QR, "GROOM")).toBe("FAILED");
    }
  });

  it("asks for exactly this side's own URL and its own file name", async () => {
    const groom = capability();
    await downloadQrWithFeedback(groom, QR, "GROOM");
    expect(groom.saveImage).toHaveBeenCalledWith(QR.url, "ma-qr-nha-trai");
    const bride = capability();
    await downloadQrWithFeedback(bride, { ...QR, url: "https://example.test/b.webp" }, "BRIDE");
    expect(bride.saveImage).toHaveBeenCalledWith("https://example.test/b.webp", "ma-qr-nha-gai");
  });
});

// ---------------------------------------------------------------------------
// C. Every published renderer: when the control exists, and for which side
// ---------------------------------------------------------------------------

interface Published {
  readonly label: string;
  readonly download: string;
  readonly groomLabel: string;
  readonly brideLabel: string;
  readonly load: () => Promise<{ default?: unknown } & Record<string, unknown>>;
  readonly component: string;
}

const PUBLISHED: readonly Published[] = [
  { label: "elegant-editorial v1", component: "ElegantEditorialV1", download: "Tải mã QR", groomLabel: "Nhà Trai", brideLabel: "Nhà Gái",
    load: () => import("../../wedding/elegant-editorial/v1/elegant-editorial-v1") as never },
  { label: "vietnamese-heritage v1", component: "VietnameseHeritageV1", download: "Tải mã QR", groomLabel: "Nhà Trai", brideLabel: "Nhà Gái",
    load: () => import("../../wedding/vietnamese-heritage/v1/vietnamese-heritage-v1") as never },
  { label: "vietnamese-heritage v2", component: "VietnameseHeritageV2", download: "Tải mã QR", groomLabel: "Nhà Trai", brideLabel: "Nhà Gái",
    load: () => import("../../wedding/vietnamese-heritage/v2/vietnamese-heritage-v2") as never },
  { label: "romantic-minimal v1", component: "RomanticMinimalV1", download: "Tải mã QR", groomLabel: "Nhà Trai", brideLabel: "Nhà Gái",
    load: () => import("../../wedding/romantic-minimal/v1/romantic-minimal-v1") as never },
  { label: "our-wedding-story v1", component: "OurWeddingStoryV1", download: "Tải mã QR", groomLabel: "Nhà Trai", brideLabel: "Nhà Gái",
    load: () => import("../../wedding/our-wedding-story/v1/our-wedding-story-v1") as never },
  { label: "our-wedding-story v2", component: "OurWeddingStoryV2", download: "Tải mã QR", groomLabel: "Nhà Trai", brideLabel: "Nhà Gái",
    load: () => import("../../wedding/our-wedding-story/v2/our-wedding-story-v2") as never },
  { label: "se-duyen v1", component: "SeDuyenV1", download: "Tải mã QR", groomLabel: "Nhà Trai", brideLabel: "Nhà Gái",
    load: () => import("../../wedding/se-duyen/v1/se-duyen-v1") as never },
  { label: "se-duyen v2", component: "SeDuyenV2", download: "Tải mã QR", groomLabel: "Nhà Trai", brideLabel: "Nhà Gái",
    load: () => import("../../wedding/se-duyen/v2/se-duyen-v2") as never },
];

type RendererProps = { viewModel: unknown; sections: unknown; capabilities: unknown };

async function renderWith(
  entry: Published,
  options: { variant: "COMMON" | "GROOM" | "BRIDE"; unavailableMediaIds?: readonly string[]; withCapability?: boolean },
) {
  const fixture = await buildRendererFixture({
    variant: options.variant,
    ...(options.unavailableMediaIds === undefined ? {} : { unavailableMediaIds: options.unavailableMediaIds }),
  });
  const module = await entry.load();
  const Renderer = module[entry.component] as (props: RendererProps) => unknown;
  const download = capability();
  const html = renderToStaticMarkup(
    Renderer({
      viewModel: fixture.viewModel,
      sections: fixture.selection.effectiveSections,
      capabilities: options.withCapability === false ? {} : { download },
    }) as never,
  );
  return { html, download };
}

/** Every accessible name of a download control in the markup. */
const downloadLabels = (html: string, entry: Published) =>
  [...html.matchAll(/aria-label="([^"]*)"/g)]
    .map((match) => match[1] as string)
    .filter((label) => label.startsWith(entry.download));

describe("C: each published renderer offers the right save, or none", () => {
  it.each(PUBLISHED.map((entry) => [entry.label, entry] as const))(
    "%s · COMMON offers each family its own QR",
    async (_label, entry) => {
      const { html, download } = await renderWith(entry, { variant: "COMMON" });
      const labels = downloadLabels(html, entry);
      expect(labels).toHaveLength(2);
      expect(labels.some((l) => l.endsWith(entry.groomLabel))).toBe(true);
      expect(labels.some((l) => l.endsWith(entry.brideLabel))).toBe(true);
      // Rendering alone must never save anything.
      expect(download.saveImage).not.toHaveBeenCalled();
    },
  );

  it.each(PUBLISHED.map((entry) => [entry.label, entry] as const))(
    "%s · SEPARATE shows only the operational side",
    async (_label, entry) => {
      for (const [variant, expected] of [["GROOM", entry.groomLabel], ["BRIDE", entry.brideLabel]] as const) {
        const { html } = await renderWith(entry, { variant });
        const labels = downloadLabels(html, entry);
        expect(labels, `${entry.label} ${variant}`).toHaveLength(1);
        expect(labels[0]).toBe(`${entry.download} ${expected}`);
      }
    },
  );

  it.each(PUBLISHED.map((entry) => [entry.label, entry] as const))(
    "%s · an UNAVAILABLE QR draws no control, and the other side keeps its own",
    async (_label, entry) => {
      const { html } = await renderWith(entry, { variant: "COMMON", unavailableMediaIds: [FIXTURE_MEDIA_IDS.QR_GROOM] });
      const labels = downloadLabels(html, entry);
      expect(labels).toStrictEqual([`${entry.download} ${entry.brideLabel}`]);

      const none = await renderWith(entry, {
        variant: "COMMON",
        unavailableMediaIds: [FIXTURE_MEDIA_IDS.QR_GROOM, FIXTURE_MEDIA_IDS.QR_BRIDE],
      });
      expect(downloadLabels(none.html, entry)).toStrictEqual([]);
    },
  );

  it.each(PUBLISHED.map((entry) => [entry.label, entry] as const))(
    "%s · without the capability there is no control at all",
    async (_label, entry) => {
      const { html } = await renderWith(entry, { variant: "COMMON", withCapability: false });
      expect(downloadLabels(html, entry)).toStrictEqual([]);
      expect(html).not.toContain("qrDownload");
    },
  );

  it.each(PUBLISHED.map((entry) => [entry.label, entry] as const))(
    "%s · the gift surface it belongs to is unchanged",
    async (_label, entry) => {
      const { html } = await renderWith(entry, { variant: "COMMON" });
      // The QR image itself is still rendered and still scannable on the page.
      expect(html).toMatch(/<img[^>]+alt="Mã QR chuyển khoản/);
      // The control is a real button with a visible-focus class and a title.
      expect(html).toMatch(/<button[^>]+aria-label="Tải mã QR/);
      expect(html).toMatch(/title="Tải mã QR"/);
      // It never carries the URL, and no file name leaks into the markup.
      expect(html).not.toContain("ma-qr-nha-trai");
      expect(html).not.toContain("ma-qr-nha-gai");
    },
  );
});

describe("D: every variant is answered (Rule of Three)", () => {
  it("COMMON, GROOM and BRIDE are all covered above", () => {
    expect([...INVITATION_VARIANTS].sort()).toStrictEqual(["BRIDE", "COMMON", "GROOM"]);
  });
});
