"use client";

import type { InvitationViewModel } from "../../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../../lib/invitation-rendering/renderer-selection";
import { InvitationRendererHost } from "../../../templates/core/invitation-renderer-host";

/**
 * RF-06B harness client wrapper (docs/DECISIONS.md "RF-06-0 …" P25, P38).
 * The harness Server Component's one client entry. It receives only
 * serializable render data and renders the production host with it,
 * client-to-client. RF-06B constructs no capability here; RF-06C adds the
 * harness-only RSVP `UNAVAILABLE` capability. Not production-authoritative:
 * nothing in `templates/**` or `lib/**` imports it.
 */

interface RendererHarnessClientProps {
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export function RendererHarnessClient({ rendererKey, viewModel, sections }: RendererHarnessClientProps) {
  return <InvitationRendererHost rendererKey={rendererKey} viewModel={viewModel} sections={sections} />;
}
