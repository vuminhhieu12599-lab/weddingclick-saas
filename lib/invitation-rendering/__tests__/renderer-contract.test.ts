import type { ComponentType } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { SnapshotPayloadV1 } from "../snapshot-payload-types";
import type { InvitationViewModel } from "../invitation-view-model-types";
import type { RendererCompatibilityManifestV1 } from "../renderer-compatibility-manifest";
import {
  CLIPBOARD_COPY_RESULT_STATUSES,
  MUSIC_PLAYBACK_STATUSES,
  isMusicCapabilityPermittedV1,
  type ClipboardCapabilityV1,
  type ClipboardCopyResultStatusV1,
  type ClipboardCopyResultV1,
  type ClockCapabilityV1,
  type InvitationRendererCapabilitiesV1,
  type MusicCapabilityV1,
  type MusicPlaybackStatusV1,
} from "../renderer-capabilities";
import type { InvitationRendererComponentV1, InvitationRendererPropsV1 } from "../renderer-component";
import type { RendererEffectiveSections } from "../renderer-selection";
import type { RsvpCapabilityV1 } from "../rsvp-capability";
import * as publicApi from "../index";
import { resolved, snapshot, unavailable } from "./invitation-view-model-fixtures";
import {
  ALL_VISIBLE,
  FIXED_CLOCK,
  NullRenderer,
  PAUSED_MUSIC,
  UNAVAILABLE_CLIPBOARD,
  UNAVAILABLE_RSVP,
  contractViewModel,
  rendererProps,
} from "./renderer-contract-fixtures";
import { viewModelFor } from "./renderer-selection-fixtures";

type IsOptional<T, K extends keyof T> = object extends Pick<T, K> ? true : false;

// ---------------------------------------------------------------------------
// Renderer props (K6)
// ---------------------------------------------------------------------------

describe("InvitationRendererPropsV1", () => {
  it("has exactly viewModel, sections and capabilities", () => {
    expectTypeOf<keyof InvitationRendererPropsV1>().toEqualTypeOf<"viewModel" | "sections" | "capabilities">();
    expectTypeOf<InvitationRendererPropsV1["viewModel"]>().toEqualTypeOf<InvitationViewModel>();
    expectTypeOf<InvitationRendererPropsV1["sections"]>().toEqualTypeOf<RendererEffectiveSections>();
    expectTypeOf<InvitationRendererPropsV1["capabilities"]>().toEqualTypeOf<InvitationRendererCapabilitiesV1>();
  });

  it("requires every prop, including capabilities", () => {
    expectTypeOf<IsOptional<InvitationRendererPropsV1, "viewModel">>().toEqualTypeOf<false>();
    expectTypeOf<IsOptional<InvitationRendererPropsV1, "sections">>().toEqualTypeOf<false>();
    expectTypeOf<IsOptional<InvitationRendererPropsV1, "capabilities">>().toEqualTypeOf<false>();
  });

  it("rejects missing capabilities and non-renderer inputs at compile time", () => {
    const viewModel = contractViewModel();
    const sections = { ...ALL_VISIBLE };

    // @ts-expect-error -- capabilities is required (K14)
    const missingCapabilities: InvitationRendererPropsV1 = { viewModel, sections };

    const withRendererKey: InvitationRendererPropsV1 = {
      viewModel,
      sections,
      capabilities: {},
      // @ts-expect-error -- rendererKey is not a renderer prop (K6)
      rendererKey: "test.renderer.v1",
    };

    const withManifest: InvitationRendererPropsV1 = {
      viewModel,
      sections,
      capabilities: {},
      // @ts-expect-error -- the compatibility manifest is not renderer input (K8)
      compatibilityManifest: {} as RendererCompatibilityManifestV1,
    };

    const withSnapshot: InvitationRendererPropsV1 = {
      viewModel,
      sections,
      capabilities: {},
      // @ts-expect-error -- the Snapshot is not renderer input (K6)
      snapshot: {} as SnapshotPayloadV1,
    };

    expect([missingCapabilities, withRendererKey, withManifest, withSnapshot]).toHaveLength(4);
  });

  it("accepts the three frozen inputs with an empty capability object", () => {
    const props = rendererProps();
    expect(Object.keys(props).sort()).toEqual(["capabilities", "sections", "viewModel"]);
    expect(props.capabilities).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Renderer component (K4)
// ---------------------------------------------------------------------------

describe("InvitationRendererComponentV1", () => {
  it("is exactly ComponentType<InvitationRendererPropsV1>", () => {
    expectTypeOf<InvitationRendererComponentV1>().toEqualTypeOf<ComponentType<InvitationRendererPropsV1>>();
  });

  it("accepts a fixture component that returns null (never mounted)", () => {
    expectTypeOf(NullRenderer).toEqualTypeOf<InvitationRendererComponentV1>();
    expect(typeof NullRenderer).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Closed capability object (K14)
// ---------------------------------------------------------------------------

describe("InvitationRendererCapabilitiesV1", () => {
  it("has exactly rsvp, clipboard, music and clock", () => {
    expectTypeOf<keyof InvitationRendererCapabilitiesV1>().toEqualTypeOf<"rsvp" | "clipboard" | "music" | "clock">();
    expectTypeOf<Required<InvitationRendererCapabilitiesV1>>().toEqualTypeOf<{
      readonly rsvp: RsvpCapabilityV1;
      readonly clipboard: ClipboardCapabilityV1;
      readonly music: MusicCapabilityV1;
      readonly clock: ClockCapabilityV1;
    }>();
  });

  it("makes every member optional and has no index signature", () => {
    expectTypeOf<IsOptional<InvitationRendererCapabilitiesV1, "rsvp">>().toEqualTypeOf<true>();
    expectTypeOf<IsOptional<InvitationRendererCapabilitiesV1, "clipboard">>().toEqualTypeOf<true>();
    expectTypeOf<IsOptional<InvitationRendererCapabilitiesV1, "music">>().toEqualTypeOf<true>();
    expectTypeOf<IsOptional<InvitationRendererCapabilitiesV1, "clock">>().toEqualTypeOf<true>();
    expectTypeOf<string extends keyof InvitationRendererCapabilitiesV1 ? true : false>().toEqualTypeOf<false>();
  });

  it("accepts {} and all four members, and rejects arbitrary extras", () => {
    const empty: InvitationRendererCapabilitiesV1 = {};
    const full: InvitationRendererCapabilitiesV1 = {
      rsvp: UNAVAILABLE_RSVP,
      clipboard: UNAVAILABLE_CLIPBOARD,
      music: PAUSED_MUSIC,
      clock: FIXED_CLOCK,
    };
    const extra: InvitationRendererCapabilitiesV1 = {
      // @ts-expect-error -- closed capability object (K14)
      futureFeatures: {},
    };
    expect(Object.keys(empty)).toEqual([]);
    expect(Object.keys(full).sort()).toEqual(["clipboard", "clock", "music", "rsvp"]);
    expect(extra).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Clipboard (K21)
// ---------------------------------------------------------------------------

describe("ClipboardCapabilityV1", () => {
  it("has exactly SUCCESS, UNAVAILABLE and FAILED as status-only results", () => {
    expect(CLIPBOARD_COPY_RESULT_STATUSES).toEqual(["SUCCESS", "UNAVAILABLE", "FAILED"]);
    expectTypeOf<ClipboardCopyResultStatusV1>().toEqualTypeOf<"SUCCESS" | "UNAVAILABLE" | "FAILED">();
    expectTypeOf<ClipboardCopyResultV1>().toEqualTypeOf<
      { readonly status: "SUCCESS" } | { readonly status: "UNAVAILABLE" } | { readonly status: "FAILED" }
    >();
  });

  it("copyText(string) returns Promise<ClipboardCopyResultV1>", () => {
    expectTypeOf<keyof ClipboardCapabilityV1>().toEqualTypeOf<"copyText">();
    expectTypeOf<Parameters<ClipboardCapabilityV1["copyText"]>>().toEqualTypeOf<[text: string]>();
    expectTypeOf<ReturnType<ClipboardCapabilityV1["copyText"]>>().toEqualTypeOf<Promise<ClipboardCopyResultV1>>();
  });
});

// ---------------------------------------------------------------------------
// Music (K23–K24)
// ---------------------------------------------------------------------------

describe("MusicCapabilityV1", () => {
  it("has exactly PAUSED, PLAYING, BLOCKED and ERROR", () => {
    expect(MUSIC_PLAYBACK_STATUSES).toEqual(["PAUSED", "PLAYING", "BLOCKED", "ERROR"]);
    expectTypeOf<MusicPlaybackStatusV1>().toEqualTypeOf<"PAUSED" | "PLAYING" | "BLOCKED" | "ERROR">();
  });

  it("exposes only status, play() and pause(), both Promise<void>", () => {
    expectTypeOf<keyof MusicCapabilityV1>().toEqualTypeOf<"status" | "play" | "pause">();
    expectTypeOf<MusicCapabilityV1["status"]>().toEqualTypeOf<MusicPlaybackStatusV1>();
    expectTypeOf<Parameters<MusicCapabilityV1["play"]>>().toEqualTypeOf<[]>();
    expectTypeOf<Parameters<MusicCapabilityV1["pause"]>>().toEqualTypeOf<[]>();
    expectTypeOf<ReturnType<MusicCapabilityV1["play"]>>().toEqualTypeOf<Promise<void>>();
    expectTypeOf<ReturnType<MusicCapabilityV1["pause"]>>().toEqualTypeOf<Promise<void>>();
  });

  it("defines no music result type and no legacy MusicStatusV1", () => {
    // @ts-expect-error -- no music result union (K23)
    expectTypeOf<import("../index").MusicPlayResultV1>().toBeUnknown();
    // @ts-expect-error -- the frozen name is MusicPlaybackStatusV1
    expectTypeOf<import("../index").MusicStatusV1>().toBeUnknown();
    expect(Object.keys(publicApi).filter((name) => /music/i.test(name)).sort()).toEqual([
      "MUSIC_PLAYBACK_STATUSES",
      "isMusicCapabilityPermittedV1",
    ]);
  });
});

describe("isMusicCapabilityPermittedV1 (K24)", () => {
  it("is false when the ViewModel has no audio slot", () => {
    const media = { ...snapshot().media };
    delete media.audioMediaId;
    const viewModel = viewModelFor(snapshot({ media }));
    expect(viewModel.media.audio).toBeUndefined();
    expect(isMusicCapabilityPermittedV1(viewModel.media.audio)).toBe(false);
  });

  it("is false when the audio slot is UNAVAILABLE", () => {
    const viewModel = viewModelFor(snapshot(), "UNAVAILABLE");
    expect(viewModel.media.audio?.status).toBe("UNAVAILABLE");
    expect(isMusicCapabilityPermittedV1(viewModel.media.audio)).toBe(false);
    expect(isMusicCapabilityPermittedV1(unavailable("m-audio"))).toBe(false);
  });

  it("is true when the audio slot is RESOLVED", () => {
    const viewModel = viewModelFor(snapshot(), "RESOLVED");
    expect(viewModel.media.audio?.status).toBe("RESOLVED");
    expect(isMusicCapabilityPermittedV1(viewModel.media.audio)).toBe(true);
    expect(isMusicCapabilityPermittedV1(resolved("m-audio", null, null))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Clock (K26)
// ---------------------------------------------------------------------------

describe("ClockCapabilityV1", () => {
  it("is exactly an explicit nowEpochMs number", () => {
    expectTypeOf<ClockCapabilityV1>().toEqualTypeOf<{ readonly nowEpochMs: number }>();
  });
});
