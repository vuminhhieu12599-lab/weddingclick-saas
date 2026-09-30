import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_VARIANTS } from "../../../../../lib/domain";
import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import type {
  ClipboardCapabilityV1,
  ClipboardCopyResultV1,
} from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import { createFixtureMediaResolver } from "../../../../core/fixtures/fixture-media-resolver";
import { buildRendererFixture, runRendererFixturePipeline } from "../../../../core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_MEDIA_IDS, buildRendererFixtureSourceInput } from "../../../../core/fixtures/renderer-fixture-sources";

vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");
const { ELEGANT_EDITORIAL_V1_COPY: COPY } = await import("../copy");
const { Gift } = await import("../sections/gift");
const { GiftDialog } = await import("../interactive/gift-dialog");
const { CopyAccountButton, copyFeedbackText, copyWithFeedback } = await import("../interactive/copy-account-button");

/**
 * RF-06D gift dialog and copy control (docs/DECISIONS.md RF-05 K21–K22;
 * "RF-06-0 …" P7 "Gift", P13, P34). The RF-06B canonical side mapping is
 * unchanged and still asserted in elegant-editorial-v1.test.tsx; this file
 * covers the dialog, the clipboard gate and the copy result presentation.
 */

const V1_DIR = join(__dirname, "..");

function clipboard(result: ClipboardCopyResultV1 | "reject"): ClipboardCapabilityV1 & { copyText: ReturnType<typeof vi.fn> } {
  return {
    copyText: vi.fn(async () => {
      if (result === "reject") throw new Error("unexpected fault");
      return result;
    }),
  };
}

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  process.off("unhandledRejection", onUnhandled);
  expect(unhandled).toStrictEqual([]);
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

/** All elements of `type` in a (not yet rendered) element tree, walking children props only. */
function findElements(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child as ReactNode, type));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  const own = node.type === type ? [node] : [];
  return [...own, ...findElements(node.props.children as ReactNode, type)];
}

function giftTree(viewModel: InvitationViewModel, clip: ClipboardCapabilityV1 | undefined) {
  return Gift({ operationalSides: viewModel.operationalSides, gift: viewModel.gift, qr: viewModel.media.qr, clipboard: clip });
}

function render(viewModel: InvitationViewModel, sections: RendererEffectiveSections, clip?: ClipboardCapabilityV1) {
  return renderToStaticMarkup(
    <ElegantEditorialV1 viewModel={viewModel} sections={sections} capabilities={clip === undefined ? {} : { clipboard: clip }} />,
  );
}

function giftBlock(html: string): string {
  const start = html.indexOf('aria-labelledby="ee-gift-heading"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
}

describe("gift dialog", () => {
  it.each(INVITATION_VARIANTS)("%s: one explicit entry button and one closed, labelled modal dialog holding the canonical sides", async (variant) => {
    const { viewModel, selection } = await buildRendererFixture({ variant });
    const gift = giftBlock(render(viewModel, selection.effectiveSections));
    expect(gift).toMatch(new RegExp(`<button type="button" class="[^"]*giftOpen[^"]*" aria-haspopup="dialog">${COPY.gift.openDialog}</button>`));
    expect(gift.match(/<dialog\b[^>]*>/g)).toStrictEqual([
      expect.stringMatching(/^<dialog class="[^"]*giftDialog[^"]*" aria-labelledby="ee-gift-dialog-title">$/),
    ]);
    expect(gift).toContain(`id="ee-gift-dialog-title" class="`);
    expect(gift).toContain(`>${COPY.gift.dialogTitle}</h2>`);
    expect(gift).toMatch(new RegExp(`<button type="button" class="[^"]*giftDialogClose[^"]*">${COPY.gift.closeDialog}</button>`));
    // Close comes before the content, so showModal() moves focus onto it first.
    expect(gift.indexOf("giftDialogClose")).toBeLessThan(gift.indexOf("data-side="));
    // P7: a rendered dialog is never empty.
    const dialog = gift.slice(gift.indexOf("<dialog"), gift.indexOf("</dialog>"));
    expect(dialog.match(/data-side="(GROOM|BRIDE)"/g)?.length).toBeGreaterThan(0);
    expect(gift).not.toMatch(/QR_COMMON|commonMediaId/);
  });

  it("Rule of Three: GROOM/BRIDE dialogs hold only their own side; COMMON holds both in operational order", async () => {
    const sides = async (variant: (typeof INVITATION_VARIANTS)[number]) => {
      const { viewModel, selection } = await buildRendererFixture({ variant });
      return [...giftBlock(render(viewModel, selection.effectiveSections)).matchAll(/data-side="(\w+)"/g)].map((m) => m[1]);
    };
    expect(await sides("COMMON")).toStrictEqual(["GROOM", "BRIDE"]);
    expect(await sides("GROOM")).toStrictEqual(["GROOM"]);
    expect(await sides("BRIDE")).toStrictEqual(["BRIDE"]);
  });

  it("QR UNAVAILABLE keeps the bank text and the honest note inside the dialog", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON", unavailableMediaIds: [FIXTURE_MEDIA_IDS.QR_GROOM] });
    const dialog = giftBlock(render(viewModel, selection.effectiveSections));
    const groom = dialog.slice(dialog.indexOf('data-side="GROOM"'), dialog.indexOf('data-side="BRIDE"'));
    expect(groom).toContain("9001000000001");
    expect(groom).toContain(COPY.gift.qrUnavailable);
    expect(groom).not.toContain("<img");
  });

  it("no renderable side: no entry point, so an empty dialog can never open", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "GROOM" });
    if (input.weddingDetails === null) throw new Error("fixture");
    input.weddingDetails = { ...input.weddingDetails, groomBankName: null, groomBankAccountName: null, groomBankAccountNumber: null };
    const { viewModel, selection } = await runRendererFixturePipeline(input, {
      resolver: createFixtureMediaResolver({ unavailableMediaIds: [FIXTURE_MEDIA_IDS.QR_GROOM] }),
    });
    const html = render(viewModel, selection.effectiveSections, clipboard({ status: "SUCCESS" }));
    expect(html).not.toMatch(/<dialog|giftOpen|ee-gift-heading/);
  });

  it("sections.gift false: no gift block, dialog or copy control", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON", sectionSettings: { gift: false } });
    const html = render(viewModel, selection.effectiveSections, clipboard({ status: "SUCCESS" }));
    expect(html).not.toMatch(/<dialog|giftOpen|copyButton/);
  });

  it("dialog source: native showModal()/close(), explicit close, Escape via the native close event, focus returns to the opener", () => {
    const code = readFileSync(join(V1_DIR, "interactive", "gift-dialog.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).toMatch(/if \(open && !dialog\.open\) dialog\.showModal\(\);/);
    expect(code).toMatch(/if \(!open && dialog\.open\) dialog\.close\(\);/);
    expect(code).toMatch(/onClose=\{handleClose\}/);
    expect(code).toMatch(/openerRef\.current\?\.focus\(\);/);
    expect(code).toMatch(/onClick=\{\(\) => setOpen\(false\)\}/);
    expect(code).not.toMatch(/\bdocument\b|\bwindow\b|addEventListener|role="dialog"|aria-modal/);
  });

  it("the dialog island renders its children unchanged and nothing else of its own", () => {
    const html = renderToStaticMarkup(
      <GiftDialog>
        <p data-probe="x">nội dung</p>
      </GiftDialog>,
    );
    expect(html).toContain('<p data-probe="x">nội dung</p>');
    expect(html.match(/<button/g)).toHaveLength(2);
  });
});

describe("copy control gate (P34)", () => {
  it("no clipboard capability: no copy control; the account number stays plain selectable text", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    const gift = giftBlock(render(viewModel, selection.effectiveSections));
    expect(gift).not.toMatch(/copyButton|Sao chép/);
    expect(gift).toContain("9001000000001");
    expect(findElements(giftTree(viewModel, undefined), CopyAccountButton)).toStrictEqual([]);
  });

  it("with a clipboard capability: exactly one control per side with a canonical account number, copying that value verbatim", async () => {
    const { viewModel } = await buildRendererFixture({ variant: "COMMON" });
    const clip = clipboard({ status: "SUCCESS" });
    const buttons = findElements(giftTree(viewModel, clip), CopyAccountButton);
    expect(buttons.map((button) => [button.props.value, button.props.sideLabel])).toStrictEqual([
      [viewModel.gift.groom?.bankAccountNumber, COPY.families.labelBySide.GROOM],
      [viewModel.gift.bride?.bankAccountNumber, COPY.families.labelBySide.BRIDE],
    ]);
    for (const button of buttons) expect(button.props.clipboard).toBe(clip);
  });

  it("a side without an account number (bank name only, or QR only) gets no copy control", async () => {
    const input = buildRendererFixtureSourceInput({ variant: "COMMON" });
    if (input.weddingDetails === null) throw new Error("fixture");
    input.weddingDetails = { ...input.weddingDetails, groomBankAccountNumber: "   ", brideBankAccountNumber: null };
    const { viewModel } = await runRendererFixturePipeline(input, { resolver: createFixtureMediaResolver() });
    expect(findElements(giftTree(viewModel, clipboard({ status: "SUCCESS" })), CopyAccountButton)).toStrictEqual([]);
  });

  it("server markup with a clipboard: an idle button with a side-bearing accessible name; nothing claims copied", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "GROOM" });
    const gift = giftBlock(render(viewModel, selection.effectiveSections, clipboard({ status: "SUCCESS" })));
    expect(gift.match(/<button[^>]*copyButton[^>]*data-copy-feedback="idle"/g)).toHaveLength(1);
    expect(gift).toContain(`${COPY.gift.copyAccountNumber}<span class=`);
    expect(gift).toContain(`${COPY.gift.copyAccountNumberTarget} ${COPY.families.labelBySide.GROOM}</span>`);
    expect(gift).not.toContain(COPY.gift.copySucceeded);
  });
});

describe("copy results (K21–K22)", () => {
  it("SUCCESS only after the capability resolved SUCCESS", async () => {
    let resolveCopy: (result: ClipboardCopyResultV1) => void = () => {};
    const clip: ClipboardCapabilityV1 = {
      copyText: () =>
        new Promise((resolve) => {
          resolveCopy = resolve;
        }),
    };
    let settled: string | undefined;
    const pending = copyWithFeedback(clip, "9001000000001").then((feedback) => {
      settled = feedback;
      return feedback;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBeUndefined();
    resolveCopy({ status: "SUCCESS" });
    await expect(pending).resolves.toBe("SUCCESS");
  });

  it.each([
    [{ status: "SUCCESS" }, "SUCCESS", COPY.gift.copySucceeded],
    [{ status: "FAILED" }, "FAILED", COPY.gift.copyFailed],
    [{ status: "UNAVAILABLE" }, "UNAVAILABLE", COPY.gift.copyUnavailable],
  ] as const)("%o → %s with its fixed copy", async (result, feedback, text) => {
    const clip = clipboard(result);
    await expect(copyWithFeedback(clip, "9001000000001")).resolves.toBe(feedback);
    expect(clip.copyText).toHaveBeenCalledWith("9001000000001");
    expect(copyFeedbackText(feedback)).toBe(text);
  });

  it("a rejected copy is FAILED, handled, never success", async () => {
    await expect(copyWithFeedback(clipboard("reject"), "x")).resolves.toBe("FAILED");
  });

  it("a malformed result is never success", async () => {
    const clip = { copyText: async () => ({ status: "COPIED" }) } as unknown as ClipboardCapabilityV1;
    await expect(copyWithFeedback(clip, "x")).resolves.toBe("FAILED");
  });

  it("idle shows nothing and pending is not success copy", () => {
    expect(copyFeedbackText("IDLE")).toBeNull();
    expect(copyFeedbackText("PENDING")).toBe(COPY.gift.copyPending);
    expect(COPY.gift.copyPending).not.toBe(COPY.gift.copySucceeded);
  });

  it("the copy island never touches the Clipboard API or a legacy fallback", () => {
    const code = readFileSync(join(V1_DIR, "interactive", "copy-account-button.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/navigator|execCommand|writeText|document|localStorage|sessionStorage/);
    expect(code).toMatch(/const result = await clipboard\.copyText\(text\);/);
  });
});
