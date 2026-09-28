import type { ComponentType } from "react";

import type { InvitationViewModel } from "./invitation-view-model-types";
import type { InvitationRendererCapabilitiesV1 } from "./renderer-capabilities";
import type { RendererEffectiveSections } from "./renderer-selection";

/**
 * Invitation Rendering Foundation RF-05A — shared renderer component
 * contract (docs/DECISIONS.md "RF-05 Shared Renderer Boundary / Minimum
 * Shared Client Capabilities Contract Clarification" K3–K8).
 *
 * React types only; nothing here renders. The first real component is RF-06.
 */

/**
 * K6: exactly three inputs. Never the Snapshot, the RF-04 selection context,
 * the compatibility manifest, a registry, `rendererKey` or any token.
 */
export interface InvitationRendererPropsV1 {
  /** The frozen RF-03 ViewModel, unchanged. */
  readonly viewModel: InvitationViewModel;
  /** K7: the RF-04 effective sections, the only authoritative section visibility. */
  readonly sections: RendererEffectiveSections;
  /** K14: always provided; may be empty. */
  readonly capabilities: InvitationRendererCapabilitiesV1;
}

/** K4: the renderer is a React component type, not a render function. */
export type InvitationRendererComponentV1 = ComponentType<InvitationRendererPropsV1>;
