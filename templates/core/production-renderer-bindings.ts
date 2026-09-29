import { projectCompatibilityManifest } from "../../lib/invitation-rendering/renderer-compatibility-manifest";
import {
  createInvitationRendererBindingRegistry,
  type InvitationRendererBindingRegistryV1,
  type RendererBindingEntryV1,
} from "../../lib/invitation-rendering/renderer-binding-registry";
import type { InvitationRendererComponentV1 } from "../../lib/invitation-rendering/renderer-component";
import { ElegantEditorialV1 } from "../wedding/elegant-editorial/v1/elegant-editorial-v1";
import { PRODUCTION_RENDERER_MANIFESTS } from "./production-renderer-manifests";
import { RendererProductionManifestInvariantError, type RendererProductionManifestV1 } from "./renderer-manifest";

/**
 * Invitation Rendering Foundation RF-06B — the client-graph production
 * RF-05 binding registry (docs/DECISIONS.md "RF-06-0 …" P24, P27 B, P28).
 *
 * Entries are derived only from the already-validated
 * `PRODUCTION_RENDERER_MANIFESTS` (P19/P20 ran in RF-06A), projected through
 * the frozen RF-04 `projectCompatibilityManifest`, and built with the frozen
 * RF-05B `createInvitationRendererBindingRegistry`. The raw v1 manifest
 * constant is never registry authority. There is no discovery, fallback,
 * default, "latest" or alias.
 *
 * The component table below is the one place a production renderer key is
 * paired with its component. It must bind exactly the validated key set:
 * an unbound production manifest or an orphan component binding fails closed
 * at module load with a `RendererProductionManifestInvariantError`.
 */

/** P27 B: explicit, closed rendererKey → component table. */
const PRODUCTION_RENDERER_COMPONENTS: ReadonlyMap<string, InvitationRendererComponentV1> = new Map([
  ["wedding.elegant-editorial.v1", ElegantEditorialV1],
]);

/** Fixed messages (docs/SECURITY.md): never a key or other manifest content. */
export const PRODUCTION_RENDERER_BINDING_ERROR_MESSAGES = Object.freeze({
  UNBOUND_MANIFEST: "Production renderer manifest has no production component binding",
  ORPHAN_COMPONENT: "Production component binding has no validated production renderer manifest",
} as const);

/**
 * Pairs each validated production manifest, in list order, with its
 * component and builds the RF-05 registry. RF-04/RF-05 errors propagate
 * unchanged; key-set disagreement is an RF-06 invariant error.
 */
export function createProductionRendererBindingRegistry(
  manifests: readonly RendererProductionManifestV1[],
  components: ReadonlyMap<string, InvitationRendererComponentV1>,
): InvitationRendererBindingRegistryV1 {
  const entries: RendererBindingEntryV1[] = manifests.map((manifest) => {
    const component = components.get(manifest.compatibility.rendererKey);
    if (component === undefined) {
      throw new RendererProductionManifestInvariantError(PRODUCTION_RENDERER_BINDING_ERROR_MESSAGES.UNBOUND_MANIFEST);
    }
    return { compatibilityManifest: projectCompatibilityManifest(manifest.compatibility), component };
  });

  const manifestKeys = new Set(manifests.map((manifest) => manifest.compatibility.rendererKey));
  for (const rendererKey of components.keys()) {
    if (!manifestKeys.has(rendererKey)) {
      throw new RendererProductionManifestInvariantError(PRODUCTION_RENDERER_BINDING_ERROR_MESSAGES.ORPHAN_COMPONENT);
    }
  }

  return createInvitationRendererBindingRegistry(entries);
}

/** P27 B: the production instance, built only from `PRODUCTION_RENDERER_MANIFESTS`. */
export const PRODUCTION_RENDERER_BINDING_REGISTRY: InvitationRendererBindingRegistryV1 =
  createProductionRendererBindingRegistry(PRODUCTION_RENDERER_MANIFESTS, PRODUCTION_RENDERER_COMPONENTS);
