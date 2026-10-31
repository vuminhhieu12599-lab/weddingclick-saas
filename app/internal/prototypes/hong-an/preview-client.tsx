"use client";

import { useInvitationRendererCapabilities } from "../../../../templates/core/client/runtime-capabilities";
import type { InvitationViewModel } from "../../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../../lib/invitation-rendering/renderer-selection";
import type { RsvpCapabilityV1, RsvpSubmitResultV1 } from "../../../../lib/invitation-rendering/rsvp-capability";
import { HongAnV1 } from "../../../../templates/wedding/hong-an/v1/hong-an-v1";

/**
 * HA-TEMPLATE-01 — the Hồng Ân preview's one client entry.
 *
 * It receives only serializable render data, builds the real browser
 * capabilities with the SAME shared hook the production host uses
 * (clipboard, music, clock, download), and renders the renderer with
 * exactly the frozen RF-05 K6 props. Nothing production-authoritative
 * imports this file.
 *
 * RSVP IS HONESTLY UNAVAILABLE HERE. The preview supplies the same
 * `UNAVAILABLE`-only capability the internal harness does: the card is
 * drawn and can be filled in, the submit really goes through the shared
 * form model and gate, and the result is the honest "chưa thể gửi hồi âm".
 * Nothing is persisted, nothing is sent anywhere, and no success is ever
 * faked (CLAUDE.md §11, §22). A real reply needs the public `/i/[slug]`
 * capability, which is not part of this task.
 */

const PREVIEW_RSVP_UNAVAILABLE_RESULT: RsvpSubmitResultV1 = Object.freeze({ status: "UNAVAILABLE" });

const PREVIEW_RSVP_UNAVAILABLE: RsvpCapabilityV1 = Object.freeze({
  submit: async (): Promise<RsvpSubmitResultV1> => PREVIEW_RSVP_UNAVAILABLE_RESULT,
});

export function HongAnPreviewClient({
  viewModel,
  sections,
}: {
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}) {
  const capabilities = useInvitationRendererCapabilities(viewModel, sections, PREVIEW_RSVP_UNAVAILABLE);
  return <HongAnV1 viewModel={viewModel} sections={sections} capabilities={capabilities} />;
}
