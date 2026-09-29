import type { InvitationViewModel } from "../../../lib/invitation-rendering/invitation-view-model-types";
import { resolveInvitationRendererComponent } from "../../../lib/invitation-rendering/renderer-binding-registry";
import type { RendererEffectiveSections } from "../../../lib/invitation-rendering/renderer-selection";
import type { RsvpCapabilityV1 } from "../../../lib/invitation-rendering/rsvp-capability";
import { PRODUCTION_RENDERER_BINDING_REGISTRY } from "../production-renderer-bindings";
import { useInvitationRendererCapabilities } from "./runtime-capabilities";

/**
 * Invitation Rendering Foundation RF-06C — the host's internal client-only
 * core (docs/DECISIONS.md "RF-06-0 …" P24, P25, P30).
 *
 * Deliberately **not** a client boundary (no `"use client"`): a Server
 * Component cannot render it, so no Server Component can ever hand it a
 * callback. It is rendered only by client modules:
 *
 * - the production `InvitationRendererHost` (the only production client
 *   entry), which passes exactly its three serializable props and no `rsvp`;
 * - the internal harness client wrapper, which passes its harness-only RSVP
 *   `UNAVAILABLE` capability client-to-client (P25, P30).
 *
 * `rsvp` is the only capability a caller may supply; clipboard, music and
 * clock are always constructed here from browser adapters (P34–P36). The
 * component is resolved fail-closed from the production binding registry
 * before any capability is built; binding errors propagate (RF-05 K36 B).
 */

export interface InvitationRendererHostCoreProps {
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
  /** P30: client-to-client only. Absent in production until Task 033. */
  readonly rsvp?: RsvpCapabilityV1;
}

export function InvitationRendererHostCore({ rendererKey, viewModel, sections, rsvp }: InvitationRendererHostCoreProps) {
  const Renderer = resolveInvitationRendererComponent(PRODUCTION_RENDERER_BINDING_REGISTRY, rendererKey);
  const capabilities = useInvitationRendererCapabilities(viewModel, sections, rsvp);
  // Not a component created during render: the resolver returns the same
  // module-level component bound in the frozen production registry for a key.
  // eslint-disable-next-line react-hooks/static-components
  return <Renderer viewModel={viewModel} sections={sections} capabilities={capabilities} />;
}
