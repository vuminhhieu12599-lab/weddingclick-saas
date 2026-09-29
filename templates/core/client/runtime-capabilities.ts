import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { InvitationViewModel } from "../../../lib/invitation-rendering/invitation-view-model-types";
import type {
  ClipboardCapabilityV1,
  ClockCapabilityV1,
  InvitationRendererCapabilitiesV1,
  MusicCapabilityV1,
  MusicPlaybackStatusV1,
} from "../../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../../lib/invitation-rendering/renderer-selection";
import type { RsvpCapabilityV1 } from "../../../lib/invitation-rendering/rsvp-capability";
import { BROWSER_CLIPBOARD_CAPABILITY, isBrowserClipboardAvailable } from "./clipboard-capability";
import { BROWSER_CLOCK_SOURCE, startClockTicker } from "./clock-capability";
import { createBrowserAudio, createMusicController, resolveMusicSourceUrl } from "./music-capability";

/**
 * Invitation Rendering Foundation RF-06C — client-side runtime capability
 * composition (docs/DECISIONS.md "RF-06-0 …" P24, P30, P34–P36; RF-05 K14).
 *
 * Runs only inside the host's client graph. The browser adapters own every
 * browser global; this module owns only the React lifecycle around them:
 *
 * - clipboard: present once a usable Clipboard API is observed on the client
 *   (absent in server render and hydration);
 * - music: present only for `sections.music` and a `RESOLVED` audio slot;
 *   its status is delivered by rerendering with an updated value (K23);
 * - clock: absent in server render and the first client render, present
 *   after mount, refreshed about every second, stopped on unmount (P36);
 * - rsvp: only what the client-graph caller passed; never constructed here.
 */

/** All four closed K14 members, each explicitly present or `undefined`. */
export interface RendererCapabilityPartsV1 {
  readonly rsvp: RsvpCapabilityV1 | undefined;
  readonly clipboard: ClipboardCapabilityV1 | undefined;
  readonly music: MusicCapabilityV1 | undefined;
  readonly clock: ClockCapabilityV1 | undefined;
}

type MutableCapabilities = { -readonly [K in keyof InvitationRendererCapabilitiesV1]: InvitationRendererCapabilitiesV1[K] };

/**
 * K14: a fresh, frozen, closed object holding only the four known members,
 * each copied by name and omitted (not set to `undefined`) when absent.
 * Nothing else from `parts` is ever carried over.
 */
export function composeRendererCapabilities(parts: RendererCapabilityPartsV1): InvitationRendererCapabilitiesV1 {
  const capabilities: MutableCapabilities = {};
  if (parts.rsvp !== undefined) capabilities.rsvp = parts.rsvp;
  if (parts.clipboard !== undefined) capabilities.clipboard = parts.clipboard;
  if (parts.music !== undefined) capabilities.music = parts.music;
  if (parts.clock !== undefined) capabilities.clock = parts.clock;
  return Object.freeze(capabilities);
}

function subscribeNever(): () => void {
  return () => {};
}

function serverClipboardAvailable(): boolean {
  return false;
}

function useClipboardCapability(): ClipboardCapabilityV1 | undefined {
  const available = useSyncExternalStore(subscribeNever, isBrowserClipboardAvailable, serverClipboardAvailable);
  return available ? BROWSER_CLIPBOARD_CAPABILITY : undefined;
}

function pausedStatus(): MusicPlaybackStatusV1 {
  return "PAUSED";
}

function useMusicCapability(url: string | null): MusicCapabilityV1 | undefined {
  // One controller per resolved URL; creating it creates no audio instance.
  const controller = useMemo(() => (url === null ? null : createMusicController(url, createBrowserAudio)), [url]);

  useEffect(() => {
    if (controller === null) return undefined;
    controller.activate();
    return () => controller.deactivate();
  }, [controller]);

  const status = useSyncExternalStore(
    controller === null ? subscribeNever : controller.subscribe,
    controller === null ? pausedStatus : controller.getStatus,
    pausedStatus,
  );

  return useMemo(
    () => (controller === null ? undefined : Object.freeze({ status, play: controller.play, pause: controller.pause })),
    [controller, status],
  );
}

function useClockCapability(): ClockCapabilityV1 | undefined {
  const [nowEpochMs, setNowEpochMs] = useState<number | null>(null);

  useEffect(() => startClockTicker(BROWSER_CLOCK_SOURCE, setNowEpochMs), []);

  return useMemo(() => (nowEpochMs === null ? undefined : Object.freeze({ nowEpochMs })), [nowEpochMs]);
}

/** The host's capability object for one rendered invitation. */
export function useInvitationRendererCapabilities(
  viewModel: InvitationViewModel,
  sections: RendererEffectiveSections,
  rsvp: RsvpCapabilityV1 | undefined,
): InvitationRendererCapabilitiesV1 {
  const clipboard = useClipboardCapability();
  const music = useMusicCapability(resolveMusicSourceUrl(sections.music, viewModel.media.audio));
  const clock = useClockCapability();
  return useMemo(
    () => composeRendererCapabilities({ rsvp, clipboard, music, clock }),
    [rsvp, clipboard, music, clock],
  );
}
