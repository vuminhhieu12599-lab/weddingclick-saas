import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationViewModel } from "../../../../../lib/invitation-rendering/invitation-view-model-types";
import {
  MUSIC_PLAYBACK_STATUSES,
  type MusicCapabilityV1,
  type MusicPlaybackStatusV1,
} from "../../../../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../../../../lib/invitation-rendering/renderer-selection";
import { buildRendererFixture } from "../../../../core/fixtures/renderer-fixture-pipeline";
import { FIXTURE_MEDIA_IDS } from "../../../../core/fixtures/renderer-fixture-sources";

vi.mock("../fonts", () => ({ ELEGANT_EDITORIAL_V1_FONT_VARIABLES_CLASS_NAME: "ee-test-font-variables" }));

const { ElegantEditorialV1 } = await import("../elegant-editorial-v1");
const { ELEGANT_EDITORIAL_V1_COPY: COPY } = await import("../copy");
const { MusicControl, musicStatusNote, runMusicToggle } = await import("../interactive/music-control");

/**
 * RF-06D music control (docs/DECISIONS.md RF-05 K23–K25; "RF-06-0 …" P35)
 * over deterministic capability doubles. The real adapter is RF-06C's and
 * is exercised manually in the `music-resolved` harness scenario.
 */

interface MusicDouble extends MusicCapabilityV1 {
  readonly play: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly pause: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

function music(status: MusicPlaybackStatusV1, behavior: "resolve" | "reject" = "resolve"): MusicDouble {
  const command = () =>
    vi.fn<() => Promise<void>>(() => (behavior === "resolve" ? Promise.resolve() : Promise.reject(new Error("unexpected fault"))));
  return { status, play: command(), pause: command() };
}

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("Audio", vi.fn());
});

afterEach(async () => {
  await new Promise((resolve) => setImmediate(resolve));
  process.off("unhandledRejection", onUnhandled);
  expect(unhandled).toStrictEqual([]);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(Audio).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

async function fixture(options: { music?: boolean; audioUnavailable?: boolean } = {}) {
  const { viewModel, selection } = await buildRendererFixture({
    variant: "COMMON",
    ...(options.music === false ? { sectionSettings: { music: false } } : {}),
    ...(options.audioUnavailable === true ? { unavailableMediaIds: [FIXTURE_MEDIA_IDS.AUDIO] } : {}),
  });
  return { viewModel, sections: selection.effectiveSections };
}

function render(viewModel: InvitationViewModel, sections: RendererEffectiveSections, capability?: MusicCapabilityV1) {
  return renderToStaticMarkup(
    <ElegantEditorialV1 viewModel={viewModel} sections={sections} capabilities={capability === undefined ? {} : { music: capability }} />,
  );
}

// Gift side tabs also use aria-pressed, so the music UI is matched by its own hooks and glyphs.
const MUSIC_UI = /data-music-status|musicButton|musicGlyph|Nhạc nền|nhạc|♪|♫/i;

describe("render gate (P35 degraded-state rule)", () => {
  it("no capability → no control, no indicator, no placeholder", async () => {
    const { viewModel, sections } = await fixture();
    expect(sections.music).toBe(true);
    expect(render(viewModel, sections)).not.toMatch(MUSIC_UI);
  });

  it("sections.music false → no control even with a capability present", async () => {
    const { viewModel, sections } = await fixture({ music: false });
    expect(sections.music).toBe(false);
    expect(render(viewModel, sections, music("PAUSED"))).not.toMatch(MUSIC_UI);
  });

  it("UNAVAILABLE audio (no capability from the host) → nothing music-related", async () => {
    const { viewModel, sections } = await fixture({ audioUnavailable: true });
    expect(viewModel.media.audio?.status).toBe("UNAVAILABLE");
    expect(render(viewModel, sections)).not.toMatch(MUSIC_UI);
  });

  it("section on + capability → exactly one real toggle button; the renderer never inspects media.audio for it", async () => {
    const { viewModel, sections } = await fixture();
    const html = render(viewModel, sections, music("PAUSED"));
    expect(html.match(/<button[^>]*musicButton[^>]*aria-pressed/g)).toHaveLength(1);
    expect(html).not.toMatch(/<audio|autoplay/);
    expect(html).not.toContain(viewModel.media.audio?.status === "RESOLVED" ? viewModel.media.audio.url : "∅");
  });

  it("rendering never plays, pauses or constructs audio (no autoplay)", async () => {
    const { viewModel, sections } = await fixture();
    for (const status of MUSIC_PLAYBACK_STATUSES) {
      const double = music(status);
      render(viewModel, sections, double);
      expect(double.play).not.toHaveBeenCalled();
      expect(double.pause).not.toHaveBeenCalled();
    }
  });
});

describe("status presentation (K23: status is the only playback truth)", () => {
  function control(status: MusicPlaybackStatusV1): string {
    return renderToStaticMarkup(<MusicControl music={music(status)} />);
  }

  it("PAUSED: not pressed, no note", () => {
    const html = control("PAUSED");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('data-music-status="paused"');
    expect(html).toContain(`>${COPY.music.toggle}</span>`);
    expect(html).not.toMatch(new RegExp(`${COPY.music.blocked}|${COPY.music.error}`));
  });

  it("PLAYING: pressed — the only status that claims playback", () => {
    for (const status of MUSIC_PLAYBACK_STATUSES) {
      expect(control(status).includes('aria-pressed="true"'), status).toBe(status === "PLAYING");
    }
  });

  it("BLOCKED and ERROR: not pressed, honest fixed note in a status region", () => {
    for (const [status, note] of [
      ["BLOCKED", COPY.music.blocked],
      ["ERROR", COPY.music.error],
    ] as const) {
      const html = control(status);
      expect(html).toContain('aria-pressed="false"');
      expect(html).toMatch(new RegExp(`role="status">${note.replace(/\./g, "\\.")}</p>`));
    }
  });

  it("the status note is fixed copy per status, and a command fault takes precedence", () => {
    expect(musicStatusNote("PAUSED", false)).toBeNull();
    expect(musicStatusNote("PLAYING", false)).toBeNull();
    expect(musicStatusNote("BLOCKED", false)).toBe(COPY.music.blocked);
    expect(musicStatusNote("ERROR", false)).toBe(COPY.music.error);
    for (const status of MUSIC_PLAYBACK_STATUSES) expect(musicStatusNote(status, true)).toBe(COPY.music.commandFailed);
  });

  it("an always-present status region keeps announcements possible without a visible placeholder", () => {
    expect(control("PAUSED")).toMatch(/<p class="[^"]*srOnly[^"]*" role="status"><\/p>/);
  });
});

describe("explicit play / pause actions", () => {
  it.each(["PAUSED", "BLOCKED", "ERROR"] as const)("%s: a toggle calls play() once (the explicit retry for BLOCKED/ERROR)", async (status) => {
    const double = music(status);
    await expect(runMusicToggle(double)).resolves.toBe("COMPLETED");
    expect(double.play).toHaveBeenCalledTimes(1);
    expect(double.pause).not.toHaveBeenCalled();
  });

  it("PLAYING: a toggle calls pause() once", async () => {
    const double = music("PLAYING");
    await expect(runMusicToggle(double)).resolves.toBe("COMPLETED");
    expect(double.pause).toHaveBeenCalledTimes(1);
    expect(double.play).not.toHaveBeenCalled();
  });

  it("ERROR keeps an operable, unpressed toggle whose status note offers the retry", () => {
    const html = renderToStaticMarkup(<MusicControl music={music("ERROR")} />);
    expect(html).toMatch(/<button type="button" class="[^"]*musicButton[^"]*" aria-pressed="false">/);
    expect(html).not.toMatch(/<button[^>]*(disabled|aria-disabled)/);
    expect(html).toContain(`>${COPY.music.toggle}</span>`);
    expect(COPY.music.error).toMatch(/thử lại/);
  });

  it("each explicit press from ERROR is exactly one fresh play() and never a pause()", async () => {
    const double = music("ERROR");
    await runMusicToggle(double);
    await new Promise((resolve) => setImmediate(resolve));
    expect(double.play).toHaveBeenCalledTimes(1);
    await runMusicToggle(double);
    expect(double.play).toHaveBeenCalledTimes(2);
    expect(double.pause).not.toHaveBeenCalled();
  });

  it("the command never retries on its own", async () => {
    const double = music("BLOCKED");
    await runMusicToggle(double);
    await new Promise((resolve) => setImmediate(resolve));
    expect(double.play).toHaveBeenCalledTimes(1);
  });
});

describe("rejected commands (K23 unexpected faults)", () => {
  it("rejected play() → FAULTED, handled, capability status untouched", async () => {
    const double = music("PAUSED", "reject");
    await expect(runMusicToggle(double)).resolves.toBe("FAULTED");
    expect(double.status).toBe("PAUSED");
  });

  it("rejected pause() → FAULTED, handled, never shown as paused by the control", async () => {
    const double = music("PLAYING", "reject");
    await expect(runMusicToggle(double)).resolves.toBe("FAULTED");
    expect(double.status).toBe("PLAYING");
    // Presentation still follows the authoritative status, not the command.
    expect(renderToStaticMarkup(<MusicControl music={double} />)).toContain('aria-pressed="true"');
  });

  it("a synchronously throwing command is also contained", async () => {
    const throwing: MusicCapabilityV1 = {
      status: "PAUSED",
      play: () => {
        throw new TypeError("programming fault");
      },
      pause: async () => {},
    };
    await expect(runMusicToggle(throwing)).resolves.toBe("FAULTED");
  });
});

describe("Task029 music visual language (Design Baseline B5 item 18)", () => {
  const css = readFileSync(join(__dirname, "..", "elegant-editorial-v1.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("♪ while not playing, ♫ only while PLAYING, decorative to assistive technology", () => {
    for (const status of MUSIC_PLAYBACK_STATUSES) {
      const html = renderToStaticMarkup(<MusicControl music={music(status)} />);
      expect(html).toMatch(new RegExp(`<span class="[^"]*musicGlyph[^"]*" aria-hidden="true">${status === "PLAYING" ? "♫" : "♪"}</span>`));
    }
  });

  it("40 px ivory/gold round control at the top right; the pulse is keyed on PLAYING only and removed under reduced motion", () => {
    expect(css).toMatch(/\.music \{[^}]*position: fixed;[^}]*top: 16px;/);
    expect(css).toMatch(/\.musicButton \{[^}]*width: 40px;[^}]*height: 40px;[^}]*border: 1px solid var\(--ee-gold\);/);
    const pulses = [...css.matchAll(/([^{}]+)\{[^{}]*animation: ee-music-pulse/g)].map((match) => (match[1] as string).trim());
    expect(pulses).toStrictEqual(['.music[data-music-status="playing"] .musicGlyph']);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.music\[data-music-status="playing"\] \.musicGlyph \{\s*animation: none;/);
  });
});
