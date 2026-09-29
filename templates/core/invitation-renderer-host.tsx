"use client";

import type { InvitationViewModel } from "../../lib/invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../lib/invitation-rendering/renderer-selection";
import { InvitationRendererHostCore } from "./client/invitation-renderer-host-core";

/**
 * Invitation Rendering Foundation RF-06B/RF-06C — the production client
 * boundary (docs/DECISIONS.md "RF-06-0 …" P23–P26, P30, P34–P36).
 *
 * The only client entry a production composition imports. It receives only
 * serializable data across the RSC boundary and renders the internal
 * client-only core with exactly those three values. The core resolves the
 * component fail-closed (binding errors propagate; nothing is caught or
 * turned into UI, and there is no fallback) and builds the runtime
 * capabilities inside the client graph (RF-06C): clipboard, music and clock
 * from browser adapters, and **no** RSVP capability (P30, Task 033).
 *
 * No capability is ever accepted from a Server Component (P25): this host
 * takes no capability, override or callback prop.
 */

/** P23: exactly the three serializable inputs. */
export interface InvitationRendererHostProps {
  readonly rendererKey: string;
  readonly viewModel: InvitationViewModel;
  readonly sections: RendererEffectiveSections;
}

export function InvitationRendererHost({ rendererKey, viewModel, sections }: InvitationRendererHostProps) {
  return <InvitationRendererHostCore rendererKey={rendererKey} viewModel={viewModel} sections={sections} />;
}
