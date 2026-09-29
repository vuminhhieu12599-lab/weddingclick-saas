"use client";

import type { InvitationViewModel } from "../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../lib/invitation-rendering/renderer-selection";
import type { RsvpCapabilityV1, RsvpSubmitResultV1 } from "../../../lib/invitation-rendering/rsvp-capability";
import { InvitationRendererHostCore } from "../../../templates/core/client/invitation-renderer-host-core";

/**
 * RF-06B/RF-06C harness client wrapper (docs/DECISIONS.md "RF-06-0 …" P25,
 * P30, P33, P38). The harness Server Component's one client entry. It
 * receives only serializable render data, constructs the harness-only RSVP
 * `UNAVAILABLE` capability here, inside the client graph, and renders the
 * host core with both, client-to-client. Not production-authoritative:
 * nothing in `templates/**` or `lib/**` imports it.
 */

/** K17/P30/P33: always the honest `UNAVAILABLE` outcome; nothing is persisted or sent. */
const HARNESS_RSVP_UNAVAILABLE_RESULT: RsvpSubmitResultV1 = Object.freeze({ status: "UNAVAILABLE" });

const HARNESS_RSVP_UNAVAILABLE: RsvpCapabilityV1 = Object.freeze({
  submit: async (): Promise<RsvpSubmitResultV1> => HARNESS_RSVP_UNAVAILABLE_RESULT,
});

interface RendererHarnessClientProps {
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export function RendererHarnessClient({ rendererKey, viewModel, sections }: RendererHarnessClientProps) {
  return (
    <InvitationRendererHostCore
      rendererKey={rendererKey}
      viewModel={viewModel}
      sections={sections}
      rsvp={HARNESS_RSVP_UNAVAILABLE}
    />
  );
}
