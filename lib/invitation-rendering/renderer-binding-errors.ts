/**
 * Invitation Rendering Foundation RF-05B — binding invariant error
 * (docs/DECISIONS.md "RF-05 Shared Renderer Boundary / Minimum Shared Client
 * Capabilities Contract Clarification" K11–K13, K36 class B).
 *
 * Thrown when the RF-05 implementation-binding layer breaks a guarantee it
 * owns: a malformed entries collection or binding entry, a missing or
 * non-component `component`, a duplicate binding `rendererKey`, a malformed
 * or runtime-corrupted binding registry, or a compatibility manifest and
 * component binding that disagree. It signals an integration/programming
 * fault, never a normal compatibility outcome. RF-04 errors
 * (`RendererSelectionError`, `RendererSelectionInvariantError`) are never
 * wrapped or converted into it. Mirrors `RendererSelectionInvariantError`.
 */
export class RendererBindingInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererBindingInvariantError";
  }
}
