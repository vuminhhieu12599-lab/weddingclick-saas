import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { MusicCapabilityV1, MusicPlaybackStatusV1 } from "../../../../../lib/invitation-rendering/renderer-capabilities";
import { createMusicController, type MusicAudioElementV1 } from "../../../../core/client/music-capability";
import { buildRendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import { activateOpening, type OpeningAction } from "../interactive/opening-state";

/** PO amendment to P35: "Mở thiệp" attempts the existing music in the same gesture; nothing else changes. */

vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { startMusicOnOpen } = await import("../interactive/music-control");
const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");

function capability(status: MusicPlaybackStatusV1, play = vi.fn(async () => {})) {
  const pause = vi.fn(async () => {});
  const music: MusicCapabilityV1 = { status, play, pause };
  return { music, play, pause };
}

describe("envelope activation (pure)", () => {
  it("while SEALED: onOpen runs exactly once, synchronously, before OPEN is dispatched", () => {
    const calls: string[] = [];
    activateOpening("SEALED", () => calls.push("onOpen"), (action: OpeningAction) => calls.push(action));
    expect(calls).toEqual(["onOpen", "OPEN"]);
  });

  it("after the opening started or finished, a repeated click never re-runs onOpen", () => {
    const onOpen = vi.fn();
    const dispatch = vi.fn();
    activateOpening("OPENING", onOpen, dispatch);
    activateOpening("OPENED", onOpen, dispatch);
    expect(onOpen).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("without music (no onOpen) the opening still opens", () => {
    const dispatch = vi.fn();
    activateOpening("SEALED", undefined, dispatch);
    expect(dispatch).toHaveBeenCalledWith("OPEN");
  });
});

describe("startMusicOnOpen over the existing capability", () => {
  it("PAUSED: one play() attempt, called synchronously inside the gesture", () => {
    const { music, play, pause } = capability("PAUSED");
    startMusicOnOpen(music)();
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).not.toHaveBeenCalled();
  });

  it("already PLAYING: nothing (never restarted, never paused)", () => {
    const { music, play, pause } = capability("PLAYING");
    startMusicOnOpen(music)();
    expect(play).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it("an unexpected play() rejection is absorbed (no unhandled rejection, no fake state)", async () => {
    const { music } = capability("PAUSED", vi.fn(async () => Promise.reject(new Error("boom"))));
    expect(() => startMusicOnOpen(music)()).not.toThrow();
    await Promise.resolve();
  });
});

describe("with the real RF-06C controller", () => {
  function setup(playImpl: () => Promise<void>) {
    const created: MusicAudioElementV1[] = [];
    const playSpy = vi.fn(playImpl);
    const controller = createMusicController("https://media.invalid/song.mp3", () => {
      const element: MusicAudioElementV1 = {
        preload: "",
        loop: false,
        src: "",
        paused: true,
        play: playSpy,
        pause: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      created.push(element);
      return element;
    });
    controller.activate();
    const music = () => ({ status: controller.getStatus(), play: controller.play, pause: controller.pause });
    return { controller, created, playSpy, music };
  }

  it("success → PLAYING; exactly one audio element, play() reached synchronously", async () => {
    const { controller, created, playSpy, music } = setup(async () => {});
    startMusicOnOpen(music())();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    await vi.waitFor(() => expect(controller.getStatus()).toBe("PLAYING"));
  });

  it("browser policy refusal → BLOCKED (no fake PLAYING); the music button's explicit retry reuses the element", async () => {
    const { controller, created, playSpy, music } = setup(async () => {
      throw new DOMException("blocked", "NotAllowedError");
    });
    startMusicOnOpen(music())();
    await vi.waitFor(() => expect(controller.getStatus()).toBe("BLOCKED"));
    await music().play();
    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(1);
  });

  it("genuine media failure → retryable ERROR; the next explicit play uses a fresh element; nothing retries on its own", async () => {
    const { controller, created, playSpy, music } = setup(async () => {
      throw new DOMException("decode", "NotSupportedError");
    });
    startMusicOnOpen(music())();
    await vi.waitFor(() => expect(controller.getStatus()).toBe("ERROR"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(playSpy).toHaveBeenCalledTimes(1);
    await music().play();
    expect(created).toHaveLength(2);
  });
});

describe("root wiring and boundaries", () => {
  const v1 = join(__dirname, "..");
  const strip = (file: string) => readFileSync(join(v1, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("the root passes the music start only where the music control itself may exist", () => {
    expect(strip("elegant-editorial-v1.tsx")).toMatch(
      /const onOpen = sections\.music && capabilities\.music !== undefined \? startMusicOnOpen\(capabilities\.music\) : undefined;/,
    );
    expect(strip("elegant-editorial-v1.tsx")).toMatch(/<OpeningCover [^>]*onOpen=\{onOpen\}/);
  });

  it("the opening island never touches music itself, and nothing uses a timer or a second Audio", () => {
    const opening = strip("interactive/opening-interaction.tsx");
    expect(opening).toMatch(/onClick=\{\(\) => activateOpening\(state\.phase, onOpen, dispatch\)\}/);
    expect(opening).not.toMatch(/music|\.play\(|Audio/i);
    for (const file of ["interactive/opening-interaction.tsx", "interactive/opening-state.ts", "interactive/music-control.tsx"]) {
      expect(strip(file), file).not.toMatch(/setTimeout|setInterval|new Audio|autoplay/);
    }
  });

  it("without audio the invitation still renders its opening and no music control", async () => {
    const { viewModel, selection } = await buildRendererFixture({ variant: "COMMON" });
    const html = renderToStaticMarkup(
      <ElegantEditorialV1 viewModel={{ ...viewModel, media: { ...viewModel.media, audio: undefined } }} sections={selection.effectiveSections} capabilities={{}} />,
    );
    expect(html).toContain("data-opening=\"sealed\"");
    expect(html).not.toContain("data-music-status");
  });
});
