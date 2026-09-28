import type { InvitationViewModel } from "./invitation-view-model-types";
import {
  RENDERER_SECTION_KEYS,
  isInvitationVariant,
  projectCompatibilityManifest,
  type RendererCompatibilityManifestV1,
  type RendererSectionKey,
} from "./renderer-compatibility-manifest";
import type { RendererCompatibilityRegistry } from "./renderer-registry";
import { RendererSelectionError, RendererSelectionInvariantError } from "./renderer-selection-errors";
import type { SnapshotPayloadV1 } from "./snapshot-payload-types";

/** R17: exactly the five R8 keys. */
export type RendererEffectiveSections = { [K in RendererSectionKey]: boolean };

/**
 * R17: separate RF-04 compatibility context. Not a renderer interface
 * (RF-05) and never merged into the ViewModel.
 */
export interface RendererSelectionContextV1 {
  rendererKey: string;
  /** A caller-owned copy; never the registry's internal object. */
  compatibilityManifest: RendererCompatibilityManifestV1;
  effectiveSections: RendererEffectiveSections;
}

export interface SelectRendererCompatibilityInput {
  /** The only source of `payloadSchemaVersion` (R16). */
  snapshot: SnapshotPayloadV1;
  viewModel: InvitationViewModel;
  registry: RendererCompatibilityRegistry;
}

/**
 * RF-04 renderer compatibility selection (docs/DECISIONS.md RF-04
 * clarification R16–R21, R26). Pure and synchronous; the first failure
 * throws, in the frozen R19 order:
 *
 * 1. Snapshot/ViewModel consistency (invariant);
 * 2. exact `rendererKey` lookup;
 *    2a. defensive re-validation of the selected manifest (invariant only);
 * 3. payload schema version membership;
 * 4. variant membership;
 * 5. reserved `sectionSettings` value validation;
 * 6. effective section visibility (R9);
 * 7. a fresh `RendererSelectionContextV1`.
 *
 * Inputs are never mutated and nothing is spread from them, so unknown
 * runtime keys cannot leak into the result.
 */
export function selectRendererCompatibility(input: SelectRendererCompatibilityInput): RendererSelectionContextV1 {
  const { snapshot, viewModel, registry } = input;

  const rendererKey = assertSnapshotViewModelConsistency(snapshot, viewModel);

  const registered = registry.lookup(rendererKey);
  if (registered === undefined) {
    throw new RendererSelectionError(
      "RENDERER_KEY_NOT_REGISTERED",
      `Renderer ${rendererKey} is not registered`,
    );
  }
  const manifest = projectCompatibilityManifest(registered);
  if (manifest.rendererKey !== rendererKey) {
    throw new RendererSelectionInvariantError(
      `Registry returned manifest ${manifest.rendererKey} for rendererKey ${rendererKey}`,
    );
  }

  if (!manifest.supportedPayloadSchemaVersions.includes(snapshot.payloadSchemaVersion)) {
    throw new RendererSelectionError(
      "PAYLOAD_SCHEMA_VERSION_UNSUPPORTED",
      `Renderer ${rendererKey} does not support payload schema version ${String(snapshot.payloadSchemaVersion)}`,
    );
  }

  if (!manifest.supportedVariants.includes(viewModel.variant)) {
    throw new RendererSelectionError(
      "VARIANT_UNSUPPORTED",
      `Renderer ${rendererKey} does not support variant ${viewModel.variant}`,
    );
  }

  const settings = readReservedSectionSettings(viewModel.design.sectionSettings);

  return {
    rendererKey: manifest.rendererKey,
    compatibilityManifest: manifest,
    effectiveSections: computeEffectiveSections(viewModel, manifest, settings),
  };
}

/**
 * R18: Snapshot and ViewModel must agree on `rendererKey`, `variant` and
 * `templateVersionId`. Never reconciled; neither side wins.
 */
function assertSnapshotViewModelConsistency(snapshot: SnapshotPayloadV1, viewModel: InvitationViewModel): string {
  const snapshotKey = snapshot.template.rendererKey;
  if (typeof snapshotKey !== "string" || snapshotKey.length === 0) {
    throw new RendererSelectionInvariantError("Snapshot rendererKey must be a non-empty string");
  }
  if (snapshotKey !== viewModel.template.rendererKey) {
    throw new RendererSelectionInvariantError("Snapshot and ViewModel rendererKey disagree");
  }
  if (!isInvitationVariant(snapshot.variant)) {
    throw new RendererSelectionInvariantError("Snapshot variant is not a canonical InvitationVariant");
  }
  if (snapshot.variant !== viewModel.variant) {
    throw new RendererSelectionInvariantError("Snapshot and ViewModel variant disagree");
  }
  if (snapshot.template.templateVersionId !== viewModel.template.templateVersionId) {
    throw new RendererSelectionInvariantError("Snapshot and ViewModel templateVersionId disagree");
  }
  return snapshotKey;
}

type ReservedSectionSettings = { [K in RendererSectionKey]?: boolean };

/**
 * R10: for each reserved key present as an own property, the value must be
 * a boolean; anything else fails closed without coercion. Keys outside the
 * five reserved keys are ignored here and left untouched in the ViewModel.
 */
function readReservedSectionSettings(sectionSettings: unknown): ReservedSectionSettings {
  if (typeof sectionSettings !== "object" || sectionSettings === null || Array.isArray(sectionSettings)) {
    throw new RendererSelectionInvariantError("ViewModel design.sectionSettings must be an object");
  }
  const record = sectionSettings as Record<string, unknown>;
  const reserved: ReservedSectionSettings = {};
  for (const key of RENDERER_SECTION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = record[key];
    if (typeof value !== "boolean") {
      throw new RendererSelectionError(
        "INVALID_SECTION_SETTING_VALUE",
        `Section setting ${key} must be a boolean`,
      );
    }
    reserved[key] = value;
  }
  return reserved;
}

/**
 * R9: `content && capability && setting !== false` per key. Runtime media
 * state (RESOLVED/UNAVAILABLE) is deliberately not an input (R11).
 */
function computeEffectiveSections(
  viewModel: InvitationViewModel,
  manifest: RendererCompatibilityManifestV1,
  settings: ReservedSectionSettings,
): RendererEffectiveSections {
  const visible = (key: RendererSectionKey): boolean => {
    const contentAvailable: unknown = viewModel.sections[key];
    if (typeof contentAvailable !== "boolean") {
      throw new RendererSelectionInvariantError(`ViewModel sections.${key} must be a boolean`);
    }
    return contentAvailable && manifest.sectionCapabilities[key] && settings[key] !== false;
  };

  return {
    invitationMessage: visible("invitationMessage"),
    loveStory: visible("loveStory"),
    gallery: visible("gallery"),
    music: visible("music"),
    gift: visible("gift"),
  };
}
