import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationRendererPropsV1 } from "../../../../lib/invitation-rendering/renderer-component";
import type {
  ClipboardCapabilityV1,
  ClockCapabilityV1,
  InvitationRendererCapabilitiesV1,
  MusicCapabilityV1,
} from "../../../../lib/invitation-rendering/renderer-capabilities";
import type { RsvpCapabilityV1 } from "../../../../lib/invitation-rendering/rsvp-capability";
import { RendererBindingInvariantError } from "../../../../lib/invitation-rendering/renderer-binding-errors";
import { buildRendererFixture } from "../../fixtures/renderer-fixture-pipeline";
import { FIXTURE_MEDIA_IDS } from "../../fixtures/renderer-fixture-sources";

/**
 * RF-06C runtime capability composition and the host core
 * (docs/DECISIONS.md "RF-06-0 …" P24, P25, P30, P34–P36; RF-05 K14).
 *
 * The production renderer is replaced by a spy component so the exact
 * capability object the host core builds during server rendering can be
 * inspected in Node (no jsdom). Server rendering runs no effect, so this is
 * precisely the "server render / first client render" state.
 */

const received: InvitationRendererPropsV1[] = [];

// VH-01: the production binding registry also binds Vietnamese Heritage v1, whose
// next/font loaders only run under the Next compiler.
vi.mock("../../../wedding/vietnamese-heritage/v1/fonts", () => ({
  VIETNAMESE_HERITAGE_V1_FONT_VARIABLES_CLASS_NAME: "vh-test-font-variables",
}));
vi.mock("../../../wedding/elegant-editorial/v1/elegant-editorial-v1", () => ({
  ElegantEditorialV1: (props: InvitationRendererPropsV1) => {
    received.push(props);
    return <div data-renderer="spy" />;
  },
}));

const { composeRendererCapabilities } = await import("../runtime-capabilities");
const { InvitationRendererHostCore } = await import("../invitation-renderer-host-core");
const { InvitationRendererHost } = await import("../../invitation-renderer-host");

const RSVP: RsvpCapabilityV1 = { submit: async () => ({ status: "UNAVAILABLE" }) };
const CLIPBOARD: ClipboardCapabilityV1 = { copyText: async () => ({ status: "SUCCESS" }) };
const MUSIC: MusicCapabilityV1 = { status: "PAUSED", play: async () => {}, pause: async () => {} };
const CLOCK: ClockCapabilityV1 = { nowEpochMs: 1 };

let fetchSpy: ReturnType<typeof vi.fn>;
let audioConstructed: number;

beforeEach(() => {
  received.length = 0;
  audioConstructed = 0;
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal(
    "Audio",
    class {
      constructor() {
        audioConstructed += 1;
      }
    },
  );
  // A usable Clipboard API is present: server rendering must still expose none.
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function lastCapabilities(): InvitationRendererCapabilitiesV1 {
  expect(received.length).toBeGreaterThan(0);
  return (received.at(-1) as InvitationRendererPropsV1).capabilities;
}

describe("composeRendererCapabilities (K14 closed object)", () => {
  it("all absent → a frozen empty object", () => {
    const capabilities = composeRendererCapabilities({ rsvp: undefined, clipboard: undefined, music: undefined, clock: undefined });
    expect(Reflect.ownKeys(capabilities)).toStrictEqual([]);
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(Object.getPrototypeOf(capabilities)).toBe(Object.prototype);
  });

  it("copies each present member by name and omits absent ones (no undefined-valued keys)", () => {
    const capabilities = composeRendererCapabilities({ rsvp: undefined, clipboard: CLIPBOARD, music: undefined, clock: CLOCK });
    expect(Reflect.ownKeys(capabilities)).toStrictEqual(["clipboard", "clock"]);
    expect(capabilities.clipboard).toBe(CLIPBOARD);
    expect(capabilities.clock).toBe(CLOCK);
    expect("rsvp" in capabilities).toBe(false);
    expect("music" in capabilities).toBe(false);
  });

  it("all four present → exactly the four K14 keys", () => {
    const capabilities = composeRendererCapabilities({ rsvp: RSVP, clipboard: CLIPBOARD, music: MUSIC, clock: CLOCK });
    expect(Reflect.ownKeys(capabilities)).toStrictEqual(["rsvp", "clipboard", "music", "clock"]);
  });

  it("never carries over an unknown key smuggled into the parts object", () => {
    const parts = { rsvp: undefined, clipboard: undefined, music: undefined, clock: undefined, share: () => {}, capabilityOverrides: {} };
    const capabilities = composeRendererCapabilities(parts);
    expect(Reflect.ownKeys(capabilities)).toStrictEqual([]);
  });

  it("returns a fresh object each call", () => {
    const parts = { rsvp: undefined, clipboard: CLIPBOARD, music: undefined, clock: undefined };
    expect(composeRendererCapabilities(parts)).not.toBe(composeRendererCapabilities(parts));
  });
});

describe("InvitationRendererHostCore: server render / first client render", () => {
  it("RESOLVED audio + music section: exactly { music } with PAUSED status and no audio instance", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    expect(viewModel.media.audio?.status).toBe("RESOLVED");
    expect(selection.effectiveSections.music).toBe(true);
    const now = vi.spyOn(Date, "now");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    const markup = renderToStaticMarkup(
      <InvitationRendererHostCore rendererKey={selection.rendererKey} viewModel={viewModel} sections={selection.effectiveSections} />,
    );

    expect(markup).toBe('<div data-renderer="spy"></div>');
    const capabilities = lastCapabilities();
    expect(Reflect.ownKeys(capabilities)).toStrictEqual(["music"]);
    expect(Object.isFrozen(capabilities)).toBe(true);
    const music = capabilities.music as MusicCapabilityV1;
    expect(Object.keys(music).sort()).toStrictEqual(["pause", "play", "status"]);
    expect(music.status).toBe("PAUSED");
    expect(Object.isFrozen(music)).toBe(true);
    expect(audioConstructed).toBe(0);
    expect(now).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("a play() issued before mount creates no audio instance and stays PAUSED", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "GROOM" });
    renderToStaticMarkup(
      <InvitationRendererHostCore rendererKey={selection.rendererKey} viewModel={viewModel} sections={selection.effectiveSections} />,
    );
    const music = lastCapabilities().music as MusicCapabilityV1;
    await music.play();
    await music.pause();
    expect(audioConstructed).toBe(0);
  });

  it("UNAVAILABLE audio → no music capability", async () => {
    const { viewModel, selection } = await buildRendererFixture({
      variant: "BRIDE",
      unavailableMediaIds: [FIXTURE_MEDIA_IDS.AUDIO],
    });
    expect(viewModel.media.audio?.status).toBe("UNAVAILABLE");
    renderToStaticMarkup(
      <InvitationRendererHostCore rendererKey={selection.rendererKey} viewModel={viewModel} sections={selection.effectiveSections} />,
    );
    expect(Reflect.ownKeys(lastCapabilities())).toStrictEqual([]);
  });

  it("absent audio → no music capability", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    const withoutAudio = { ...viewModel, media: { ...viewModel.media, audio: undefined } };
    renderToStaticMarkup(
      <InvitationRendererHostCore rendererKey={selection.rendererKey} viewModel={withoutAudio} sections={selection.effectiveSections} />,
    );
    expect(Reflect.ownKeys(lastCapabilities())).toStrictEqual([]);
  });

  it("sections.music false → no music capability even for RESOLVED audio", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON", sectionSettings: { music: false } });
    expect(viewModel.media.audio?.status).toBe("RESOLVED");
    expect(selection.effectiveSections.music).toBe(false);
    renderToStaticMarkup(
      <InvitationRendererHostCore rendererKey={selection.rendererKey} viewModel={viewModel} sections={selection.effectiveSections} />,
    );
    expect(Reflect.ownKeys(lastCapabilities())).toStrictEqual([]);
  });

  it("a client-graph RSVP capability passes through by identity", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON", sectionSettings: { music: false } });
    renderToStaticMarkup(
      <InvitationRendererHostCore
        rendererKey={selection.rendererKey}
        viewModel={viewModel}
        sections={selection.effectiveSections}
        rsvp={RSVP}
      />,
    );
    const capabilities = lastCapabilities();
    expect(Reflect.ownKeys(capabilities)).toStrictEqual(["rsvp"]);
    expect(capabilities.rsvp).toBe(RSVP);
  });

  it("clipboard, music and clock cannot be supplied from outside (typed and at runtime)", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON", sectionSettings: { music: false } });
    type CoreProps = Parameters<typeof InvitationRendererHostCore>[0];
    const base: CoreProps = { rendererKey: selection.rendererKey, viewModel, sections: selection.effectiveSections };
    // @ts-expect-error — only `rsvp` may be injected.
    const withClipboard: CoreProps = { ...base, clipboard: CLIPBOARD };
    // @ts-expect-error — only `rsvp` may be injected.
    const withMusic: CoreProps = { ...base, music: MUSIC };
    // @ts-expect-error — only `rsvp` may be injected.
    const withClock: CoreProps = { ...base, clock: CLOCK };
    // @ts-expect-error — no generic capability bag.
    const withBag: CoreProps = { ...base, capabilities: { clipboard: CLIPBOARD } };
    // @ts-expect-error — no override API.
    const withOverrides: CoreProps = { ...base, capabilityOverrides: { clock: CLOCK } };

    for (const props of [withClipboard, withMusic, withClock, withBag, withOverrides]) {
      received.length = 0;
      renderToStaticMarkup(<InvitationRendererHostCore {...props} />);
      expect(Reflect.ownKeys(lastCapabilities())).toStrictEqual([]);
    }
  });

  it("an unknown rendererKey fails closed before any capability is built", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    for (const key of ["wedding.elegant-editorial.v2", "", "latest"]) {
      expect(() =>
        renderToStaticMarkup(<InvitationRendererHostCore rendererKey={key} viewModel={viewModel} sections={selection.effectiveSections} />),
      ).toThrow(RendererBindingInvariantError);
    }
    expect(received).toHaveLength(0);
    expect(audioConstructed).toBe(0);
  });

  it("passes viewModel and sections through by identity with exactly the K6 props", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    renderToStaticMarkup(
      <InvitationRendererHostCore rendererKey={selection.rendererKey} viewModel={viewModel} sections={selection.effectiveSections} rsvp={RSVP} />,
    );
    const props = received.at(-1) as InvitationRendererPropsV1;
    expect(Object.keys(props).sort()).toStrictEqual(["capabilities", "sections", "viewModel"]);
    expect(props.viewModel).toBe(viewModel);
    expect(props.sections).toBe(selection.effectiveSections);
  });
});

describe("production InvitationRendererHost capability composition", () => {
  it("builds no RSVP capability: only music for the full fixture during server render", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    renderToStaticMarkup(
      <InvitationRendererHost rendererKey={selection.rendererKey} viewModel={viewModel} sections={selection.effectiveSections} />,
    );
    const capabilities = lastCapabilities();
    expect(Reflect.ownKeys(capabilities)).toStrictEqual(["music"]);
    expect("rsvp" in capabilities).toBe(false);
  });

  it("ignores any extra callback-bearing prop at runtime (no RSVP, no override)", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON", sectionSettings: { music: false } });
    const smuggled = {
      rendererKey: selection.rendererKey,
      viewModel,
      sections: selection.effectiveSections,
      rsvp: RSVP,
      capabilities: { clipboard: CLIPBOARD },
      capabilityOverrides: { clock: CLOCK },
    } as unknown as Parameters<typeof InvitationRendererHost>[0];
    renderToStaticMarkup(<InvitationRendererHost {...smuggled} />);
    expect(Reflect.ownKeys(lastCapabilities())).toStrictEqual([]);
  });
});
