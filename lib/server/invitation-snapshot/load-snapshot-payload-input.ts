import type {
  BuildSnapshotPayloadInput,
  SnapshotMediaSource,
} from "../../invitation-rendering/snapshot-payload-types";
import type { StaffContext } from "../auth/staff-context";
import type { MediaGateway } from "../media/media-gateway";
import type { ProjectDressCodeGateway } from "../project-dress-code/project-dress-code-gateway";
import type { ProjectTimelineGateway } from "../project-timeline/project-timeline-gateway";
import { isValidUuid } from "../validation/uuid";

/** The Snapshot sources this boundary loads itself. */
type LoadedContentSourceKey = "media" | "timelineItems" | "dressCode" | "dressCodeSwatches";

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

  return {
    ...canonical,
    media,
    timelineItems,
    dressCode: dressCode === null ? null : dressCode.dressCode,
    dressCodeSwatches: dressCode === null ? [] : dressCode.swatches,
  };
}
