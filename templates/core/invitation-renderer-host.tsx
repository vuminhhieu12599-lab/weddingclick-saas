"use client";

import type { InvitationViewModel } from "../../lib/invitation-rendering/invitation-view-model-types";
import { resolveInvitationRendererComponent } from "../../lib/invitation-rendering/renderer-binding-registry";
import type { InvitationRendererCapabilitiesV1 } from "../../lib/invitation-rendering/renderer-capabilities";
import type { RendererEffectiveSections } from "../../lib/invitation-rendering/renderer-selection";
import { PRODUCTION_RENDERER_BINDING_REGISTRY } from "./production-renderer-bindings";

/**
 * Invitation Rendering Foundation RF-06B — the production client boundary
 * (docs/DECISIONS.md "RF-06-0 …" P23–P26).
 *
 * The only client entry a production composition imports. It receives only
 * serializable data across the RSC boundary, resolves the component from the
 * production binding registry with the frozen RF-05B fail-closed resolver
 * (binding errors propagate; nothing is caught or turned into UI, and there
 * is no fallback), and renders exactly the RF-05 K6 props.
 *
 * RF-06B constructs no runtime capability: every renderer receives the empty
 * closed capability object. RF-06C adds capability construction inside this
 * client graph; no capability is ever accepted from a Server Component
 * (P25), and this host takes no capability prop.
 */

/** K14: always provided; empty in RF-06B (no RSVP, clipboard, music or clock). */
export const EMPTY_CAPABILITIES: InvitationRendererCapabilitiesV1 = Object.freeze({});

/** P23: exactly the three serializable inputs. */
export interface InvitationRendererHostProps {
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export function InvitationRendererHost({ rendererKey, viewModel, sections }: InvitationRendererHostProps) {
  const Renderer = resolveInvitationRendererComponent(PRODUCTION_RENDERER_BINDING_REGISTRY, rendererKey);
  // Not a component created during render: the resolver returns the same
  // module-level component bound in the frozen production registry for a key.
  // eslint-disable-next-line react-hooks/static-components
  return <Renderer viewModel={viewModel} sections={sections} capabilities={EMPTY_CAPABILITIES} />;
}
