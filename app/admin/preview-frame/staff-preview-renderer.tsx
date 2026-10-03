"use client";

import type { InvitationViewModel } from "../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../lib/invitation-rendering/renderer-selection";
import type { RsvpCapabilityV1, RsvpSubmitResultV1 } from "../../../lib/invitation-rendering/rsvp-capability";
import { InvitationRendererHostCore } from "../../../templates/core/client/invitation-renderer-host-core";

/**
 * Staff Preview client wrapper (docs/DECISIONS.md P30 amendment "Staff
 * Preview RSVP", K19). Mirrors the harness wrapper: it constructs the
 * staff-preview-only RSVP `UNAVAILABLE` capability inside the client graph
 * and passes it to the host core client-to-client, so staff can inspect the
 * RSVP section. Submitting always resolves `UNAVAILABLE`: nothing is sent or
 * persisted, no guest identity exists, and `SUCCESS` is never returned. The
 * public production host still supplies no RSVP capability until Task 033.
 * Also reused, unchanged, by the customer REVIEW frame (Task 030B,
 * app/review/[token]/frame/page.tsx) for the same visual-only RSVP.
 */

const STAFF_PREVIEW_RSVP_UNAVAILABLE_RESULT: RsvpSubmitResultV1 = Object.freeze({ status: "UNAVAILABLE" });

const STAFF_PREVIEW_RSVP_UNAVAILABLE: RsvpCapabilityV1 = Object.freeze({
  submit: async (): Promise<RsvpSubmitResultV1> => STAFF_PREVIEW_RSVP_UNAVAILABLE_RESULT,
});

interface StaffPreviewRendererProps {
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export function StaffPreviewRenderer({ rendererKey, viewModel, sections }: StaffPreviewRendererProps) {
  return (
    <InvitationRendererHostCore
      rendererKey={rendererKey}
      viewModel={viewModel}
      sections={sections}
      rsvp={STAFF_PREVIEW_RSVP_UNAVAILABLE}
    />
  );
}
