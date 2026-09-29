import { buildInvitationViewModel } from "../../../lib/invitation-rendering/build-invitation-view-model";
import { buildSnapshotPayload } from "../../../lib/invitation-rendering/build-snapshot-payload";
import type {
  GuestOverlay,
  InvitationViewModel,
  MediaResolution,
  MediaResolver,
} from "../../../lib/invitation-rendering/invitation-view-model-types";
import {
  selectRendererCompatibility,
  type RendererSelectionContextV1,
} from "../../../lib/invitation-rendering/renderer-selection";
import { resolveSnapshotMedia } from "../../../lib/invitation-rendering/resolve-snapshot-media";
import type {
  BuildSnapshotPayloadInput,
  SnapshotPayloadV1,
} from "../../../lib/invitation-rendering/snapshot-payload-types";
import {
  PRODUCTION_COMPATIBILITY_REGISTRY,
  type ProductionCompatibilityRegistryV1,
} from "../production-renderer-manifests";
import { createFixtureMediaResolver } from "./fixture-media-resolver";
import { buildRendererFixtureSourceInput, type RendererFixtureSourceOptions } from "./renderer-fixture-sources";

/**
 * Invitation Rendering Foundation RF-06A — the real pure pipeline over
 * deterministic fixtures (docs/DECISIONS.md "RF-06-0 …" P23, P38, P42):
 *
 * canonical fixture records → RF-02 `buildSnapshotPayload` → RF-03 Layer A
 * `resolveSnapshotMedia` (injected fixture resolver) → RF-03 Layer B
 * `buildInvitationViewModel` → RF-04 `selectRendererCompatibility` over the
 * server-safe production compatibility registry.
 *
 * Nothing is hand-built or re-derived here; every stage is the frozen
 * production function. No Supabase, network, current time or randomness.
 */

export interface RendererFixture {
  snapshot: SnapshotPayloadV1;
  mediaResolutions: MediaResolution[];
  viewModel: InvitationViewModel;
  selection: RendererSelectionContextV1;
}

export interface RendererFixturePipelineOptions {
  resolver: MediaResolver;
  guest?: GuestOverlay;
  /** Defaults to the production registry. */
  registry?: ProductionCompatibilityRegistryV1;
}

/** Thrown when fixture canonical data does not produce a Snapshot: a fixture bug, never a scenario. */
export class RendererFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererFixtureError";
  }
}

export async function runRendererFixturePipeline(
  input: BuildSnapshotPayloadInput,
  options: RendererFixturePipelineOptions,
): Promise<RendererFixture> {
  const built = buildSnapshotPayload(input);
  if (built.status !== "SUCCESS") {
    throw new RendererFixtureError(
      `Renderer fixture Snapshot is blocked: ${built.issues.map((issue) => issue.code).join(", ")}`,
    );
  }
  const snapshot = built.payload;
  const mediaResolutions = await resolveSnapshotMedia(snapshot, options.resolver);
  const viewModel = buildInvitationViewModel(
    options.guest === undefined ? { snapshot, mediaResolutions } : { snapshot, guest: options.guest, mediaResolutions },
  );
  const selection = selectRendererCompatibility({
    snapshot,
    viewModel,
    registry: (options.registry ?? PRODUCTION_COMPATIBILITY_REGISTRY).compatibility,
  });
  return { snapshot, mediaResolutions, viewModel, selection };
}

export interface RendererFixtureOptions extends RendererFixtureSourceOptions {
  guest?: GuestOverlay;
  unavailableMediaIds?: readonly string[];
}

/** Convenience composition: fixture sources + fixture resolver + the real pipeline. */
export function buildRendererFixture(options: RendererFixtureOptions): Promise<RendererFixture> {
  const { guest, unavailableMediaIds, ...sourceOptions } = options;
  return runRendererFixturePipeline(buildRendererFixtureSourceInput(sourceOptions), {
    resolver: createFixtureMediaResolver(unavailableMediaIds === undefined ? {} : { unavailableMediaIds }),
    ...(guest === undefined ? {} : { guest }),
  });
}
