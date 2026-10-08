import { RendererSelectionError } from "../../invitation-rendering/renderer-selection-errors";
import type {
  BuildSnapshotPayloadInput,
  SnapshotMediaSource,
} from "../../invitation-rendering/snapshot-payload-types";
import type { TemplateEditorManifestV1 } from "../../../templates/core/editor-manifest";
import type { StaffContext } from "../auth/staff-context";
import type { MediaGateway } from "../media/media-gateway";
import type { ProjectDressCodeGateway } from "../project-dress-code/project-dress-code-gateway";
import type { ProjectTimelineGateway } from "../project-timeline/project-timeline-gateway";
import type { TemplateMediaSlotGateway } from "../template-media/template-media-slot-gateway";
import { isValidUuid } from "../validation/uuid";
import { buildTemplateMediaSource, SnapshotTemplateMediaInvariantError } from "./build-template-media-source";

/** The Snapshot sources this boundary loads itself. */
type LoadedContentSourceKey = "media" | "timelineItems" | "dressCode" | "dressCodeSwatches" | "templateMedia";

/**
 * The canonical records a caller has already loaded through the existing
 * staff use cases (project, wedding details, events, design, pinned
 * template version) plus the variant being built.
 */
export type SnapshotCanonicalSources = Omit<BuildSnapshotPayloadInput, LoadedContentSourceKey>;

export interface SnapshotContentSourceGateways<TClient> {
  media: Pick<MediaGateway<TClient>, "listProjectMedia">;
  timeline: ProjectTimelineGateway<TClient>;
  dressCode: ProjectDressCodeGateway<TClient>;
  /** TE-04: draft slot rows of one Project + exact template version. */
  templateSlots: Pick<TemplateMediaSlotGateway<TClient>, "listSlotItems">;
  /** TE-04: exact-key production editor registry lookup; `undefined` fails closed. */
  lookupEditorManifest: (rendererKey: string) => TemplateEditorManifestV1 | undefined;
}

/**
 * Server-side composition boundary for a future staff preview / review /
 * publish workflow: loads the Project's media rows, Timeline rows and Dress
 * Code through the staff-scoped client (RLS is the enforcement) and returns
 * the complete input for the frozen RF-02 `buildSnapshotPayload`.
 *
 * Absence is valid data (no media `[]`, no Timeline `[]`, no Dress Code
 * `null` with no swatches); any load failure propagates and is never turned
 * into absence. Effective media-role selection stays in the builder: every
 * row is passed through, projected to the builder's source fields only, so
 * storage paths never enter the Snapshot input. Nothing is persisted here.
 *
 * TE-04: the pinned renderer's TemplateEditorManifestV1 decides the media
 * model (unknown manifest fails closed). `LEGACY_ROLES` keeps the old input
 * exactly (no `templateMedia`, no slot read). `TEMPLATE_SLOTS` reads the
 * draft slot rows of the CURRENT exact template version only (never another
 * version's retained rows) and freezes them through
 * `buildTemplateMediaSource`. Slot rows are shared by COMMON/GROOM/BRIDE.
 */
export async function loadSnapshotPayloadInput<TClient>(
  canonical: SnapshotCanonicalSources,
  staff: StaffContext<TClient>,
  gateways: SnapshotContentSourceGateways<TClient>,
): Promise<BuildSnapshotPayloadInput> {
  const projectId = canonical.project.id;
  if (!isValidUuid(projectId)) {
    throw new Error("Snapshot source project id must be a valid UUID");
  }

  const [mediaRows, timelineItems, dressCode] = await Promise.all([
    gateways.media.listProjectMedia(staff.supabase, projectId),
    gateways.timeline.listProjectTimelineItems(staff.supabase, projectId),
    gateways.dressCode.getProjectDressCode(staff.supabase, projectId),
  ]);

  const media: SnapshotMediaSource[] = mediaRows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    mediaType: row.mediaType,
    sortOrder: row.sortOrder,
  }));

  // The editor registry key set equals the production renderer key set
  // (TE-02), so a missing editor manifest is an unregistered renderer: the
  // same fail-closed RF-04 error callers already map (no default/latest).
  const manifest = gateways.lookupEditorManifest(canonical.templateVersion.rendererKey);
  if (manifest === undefined) {
    throw new RendererSelectionError("RENDERER_KEY_NOT_REGISTERED", "Renderer key is not registered");
  }

  const input: BuildSnapshotPayloadInput = {
    ...canonical,
    media,
    timelineItems,
    dressCode: dressCode === null ? null : dressCode.dressCode,
    dressCodeSwatches: dressCode === null ? [] : dressCode.swatches,
  };
  if (manifest.mediaModel === "LEGACY_ROLES") {
    return input;
  }

  if (canonical.design.templateVersionId !== canonical.templateVersion.id) {
    throw new SnapshotTemplateMediaInvariantError("Template version does not match the Project design");
  }
  const rows = await gateways.templateSlots.listSlotItems(staff.supabase, projectId, canonical.templateVersion.id);
  return { ...input, templateMedia: buildTemplateMediaSource(manifest, rows, media) };
}
