"use client";

import type { InvitationViewModel } from "../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../lib/invitation-rendering/renderer-selection";
import type { RsvpCapabilityV1, RsvpSubmitResultV1 } from "../../../lib/invitation-rendering/rsvp-capability";
import { InvitationRendererHostCore } from "../../../templates/core/client/invitation-renderer-host-core";

/**
 * LAUNCH-P0-04 showroom demo client wrapper — the same shape as the internal
 * renderer harness wrapper (docs/DECISIONS.md "RF-06-0 …" P25, P30, K17).
 * Receives only serializable demo render data and renders the production
 * host core with a demo-only RSVP capability built here in the client graph.
 *
 * The capability performs no request and persists nothing: it always
 * resolves the honest `UNAVAILABLE` outcome, so a demo can never show a
 * false RSVP success and can never reach /api/v2/public/rsvp.
 */

const DEMO_RSVP_UNAVAILABLE_RESULT: RsvpSubmitResultV1 = Object.freeze({ status: "UNAVAILABLE" });

export const DEMO_RSVP_CAPABILITY: RsvpCapabilityV1 = Object.freeze({
  submit: async (): Promise<RsvpSubmitResultV1> => DEMO_RSVP_UNAVAILABLE_RESULT,
});

interface DemoInvitationRendererProps {
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export function DemoInvitationRenderer({ rendererKey, viewModel, sections }: DemoInvitationRendererProps) {
  return <InvitationRendererHostCore rendererKey={rendererKey} viewModel={viewModel} sections={sections} rsvp={DEMO_RSVP_CAPABILITY} />;
}
