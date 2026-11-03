"use client";

import type { InvitationViewModel } from "../../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../../lib/invitation-rendering/renderer-selection";
import type { RsvpCapabilityV1, RsvpSubmitResultV1 } from "../../../../lib/invitation-rendering/rsvp-capability";
import { InvitationRendererHostCore } from "../../../../templates/core/client/invitation-renderer-host-core";

/**
 * HA-TEMPLATE-01 — the Hồng Ân preview's one client entry.
 *
 * It receives only serializable render data and renders through the SAME
 * host core the public, Staff-preview and showroom wrappers use
 * (HA-INTEGRATION-01): the renderer is resolved from the production
 * binding registry by its key and loaded lazily, and the host builds the
 * real browser capabilities (clipboard, music, clock, download). Nothing
 * production-authoritative imports this file.
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
  rendererKey,
  viewModel,
  sections,
}: {
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}) {
  return (
    <InvitationRendererHostCore
      rendererKey={rendererKey}
      viewModel={viewModel}
      sections={sections}
      rsvp={PREVIEW_RSVP_UNAVAILABLE}
    />
  );
}
