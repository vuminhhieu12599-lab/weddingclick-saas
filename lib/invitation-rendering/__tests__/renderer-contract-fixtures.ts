import type { InvitationViewModel } from "../invitation-view-model-types";
import type {
  ClipboardCapabilityV1,
  ClockCapabilityV1,
  InvitationRendererCapabilitiesV1,
  MusicCapabilityV1,
} from "../renderer-capabilities";
import type { InvitationRendererComponentV1, InvitationRendererPropsV1 } from "../renderer-component";
import type { RendererEffectiveSections } from "../renderer-selection";
import type { RsvpCapabilityV1, RsvpSubmitInputV1 } from "../rsvp-capability";
import { selectionSnapshot, viewModelFor } from "./renderer-selection-fixtures";

/**
 * RF-05A contract fixtures. Type-shaped only: no renderer, no browser
 * adapter, no persistence and no fake success (docs/DECISIONS.md RF-05
 * clarification K19, K44).
 */

/** A fixture component that renders nothing; never mounted. */
export const NullRenderer: InvitationRendererComponentV1 = () => null;

export const ALL_VISIBLE: RendererEffectiveSections = {
  invitationMessage: true,
  loveStory: true,
  gallery: true,
  music: true,
  gift: true,
  timeline: true,
  dressCode: true,
  photoStory: true,
};

export function contractViewModel(): InvitationViewModel {
  return viewModelFor(selectionSnapshot());
}

export function rendererProps(capabilities: InvitationRendererCapabilitiesV1 = {}): InvitationRendererPropsV1 {
  return { viewModel: contractViewModel(), sections: { ...ALL_VISIBLE }, capabilities };
}

/** Non-persisting RSVP capability (K19): only ever UNAVAILABLE. */
export const UNAVAILABLE_RSVP: RsvpCapabilityV1 = {
  submit: () => Promise.resolve({ status: "UNAVAILABLE" }),
};

export const UNAVAILABLE_CLIPBOARD: ClipboardCapabilityV1 = {
  copyText: () => Promise.resolve({ status: "UNAVAILABLE" }),
};

export const PAUSED_MUSIC: MusicCapabilityV1 = {
  status: "PAUSED",
  play: () => Promise.resolve(),
  pause: () => Promise.resolve(),
};

export const FIXED_CLOCK: ClockCapabilityV1 = { nowEpochMs: 1_800_000_000_000 };

export function rsvpInput(overrides: Partial<RsvpSubmitInputV1> = {}): RsvpSubmitInputV1 {
  return {
    attendance: "ATTENDING",
    partySize: 2,
    message: null,
    guestName: "Anh Hiếu và gia đình",
    ...overrides,
  };
}
