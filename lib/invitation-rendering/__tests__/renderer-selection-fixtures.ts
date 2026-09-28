import type { InvitationVariant } from "../../domain";
import { buildInvitationViewModel } from "../build-invitation-view-model";
import { extractSnapshotMediaRefs } from "../extract-snapshot-media-refs";
import type { InvitationViewModel, MediaResolution } from "../invitation-view-model-types";
import type {
  RendererCompatibilityManifestV1,
  RendererSectionCapabilities,
} from "../renderer-compatibility-manifest";
import type { SnapshotDesignSettingValue, SnapshotPayloadV1, SnapshotSections } from "../snapshot-payload-types";
import { resolved, snapshot, unavailable } from "./invitation-view-model-fixtures";

/**
 * RF-04 test fixtures. Renderer keys are test-only identifiers; RF-04 freezes
 * and registers no production key (docs/DECISIONS.md RF-04 clarification R15).
 */

export const TEST_KEY_V1 = "test.renderer.v1";
export const TEST_KEY_V2 = "test.renderer.v2";
export const TEST_TEMPLATE_VERSION_ID = "tv-test-renderer-1";

export const ALL_CAPABLE: RendererSectionCapabilities = {
  invitationMessage: true,
  loveStory: true,
  gallery: true,
  music: true,
  gift: true,
};

export function manifest(overrides: Partial<RendererCompatibilityManifestV1> = {}): RendererCompatibilityManifestV1 {
  return {
    rendererKey: TEST_KEY_V1,
    supportedPayloadSchemaVersions: [1],
    supportedVariants: ["COMMON", "GROOM", "BRIDE"],
    sectionCapabilities: { ...ALL_CAPABLE },
    ...overrides,
  };
}

export const ALL_AVAILABLE: SnapshotSections = {
  invitationMessage: true,
  loveStory: true,
  gallery: true,
  music: true,
  gift: true,
};

export interface SelectionSnapshotOptions {
  variant?: InvitationVariant;
  rendererKey?: string;
  templateVersionId?: string;
  sections?: SnapshotSections;
  sectionSettings?: Record<string, SnapshotDesignSettingValue>;
}

/** A SUCCESS-shaped Snapshot bound to a test renderer key. */
export function selectionSnapshot(options: SelectionSnapshotOptions = {}): SnapshotPayloadV1 {
  const base = snapshot({ variant: options.variant ?? "COMMON" });
  return {
    ...base,
    template: {
      templateVersionId: options.templateVersionId ?? TEST_TEMPLATE_VERSION_ID,
      rendererKey: options.rendererKey ?? TEST_KEY_V1,
    },
    sections: { ...(options.sections ?? ALL_AVAILABLE) },
    design: { ...base.design, sectionSettings: { ...(options.sectionSettings ?? {}) } },
  };
}

/** Builds the real RF-03 ViewModel for the Snapshot, with every media item in one state. */
export function viewModelFor(
  payload: SnapshotPayloadV1,
  mediaState: "RESOLVED" | "UNAVAILABLE" = "RESOLVED",
): InvitationViewModel {
  const make: (id: string) => MediaResolution = mediaState === "RESOLVED" ? (id) => resolved(id) : unavailable;
  return buildInvitationViewModel({
    snapshot: payload,
    mediaResolutions: extractSnapshotMediaRefs(payload).map(make),
  });
}
