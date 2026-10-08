import { requiredInvitationVariantsForPackage } from "../../domain";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import type { StaffInvitationPreviewDependencies } from "../invitation-preview/build-staff-invitation-preview";
import { buildTemplateMediaSource, SnapshotTemplateMediaInvariantError } from "../invitation-snapshot/build-template-media-source";
import { isValidUuid } from "../validation/uuid";
import { evaluateEditorReadiness, type EditorReadiness } from "./editor-readiness";

/** The existing staff-scoped gateways this read needs (all already wired for Staff Preview). */
export type EditorReadinessDependencies<TClient> = Pick<
  StaffInvitationPreviewDependencies<TClient>,
  "projects" | "design" | "templateVersions" | "weddingDetails" | "events" | "media" | "timeline" | "dressCode" | "templateSlots" | "lookupEditorManifest"
>;

/**
 * TE-05A — loads the trusted readiness inputs server-side and evaluates
 * them. Nothing comes from the client except the Project id. No design →
 * a legitimate BLOCKING "choose a template" result (not an error). Draft
 * slot rows that cannot be frozen give a BLOCKING TEMPLATE_MEDIA_INVALID
 * item with a fixed message (never repaired, no ids or DB detail leaked).
 * Load failures propagate (generic 500), never shown as "ready".
 */
export async function loadEditorReadiness<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  deps: EditorReadinessDependencies<TClient>,
): Promise<EditorReadiness> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const client = staff.supabase;
  const project = await deps.projects.getProjectById(client, rawProjectId);
  if (project === null) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  const design = await deps.design.getCurrentProjectDesign(client, rawProjectId);
  if (design === null) {
    return evaluateEditorReadiness({ template: "NOT_SELECTED" });
  }
  const binding = await deps.templateVersions.getTemplateVersionBinding(client, design.templateVersionId);
  if (binding === null) {
    throw new Error("Pinned template version is not readable");
  }
  const manifest = deps.lookupEditorManifest(binding.rendererKey);
  if (manifest === undefined) {
    return evaluateEditorReadiness({ template: "UNSUPPORTED" });
  }

  const [weddingDetails, events, media, timeline, dressCode] = await Promise.all([
    deps.weddingDetails.getWeddingDetailsByProjectId(client, rawProjectId),
    deps.events.listProjectEvents(client, rawProjectId),
    deps.media.listProjectMedia(client, rawProjectId),
    deps.timeline.listProjectTimelineItems(client, rawProjectId),
    deps.dressCode.getProjectDressCode(client, rawProjectId),
  ]);

  let slotCounts: Readonly<Record<string, number>> | "INVALID" | null = null;
  if (manifest.mediaModel === "TEMPLATE_SLOTS") {
    const rows = await deps.templateSlots.listSlotItems(client, rawProjectId, design.templateVersionId);
    try {
      const source = buildTemplateMediaSource(manifest, rows, media);
      slotCounts = Object.fromEntries(Object.entries(source.slots).map(([key, ids]) => [key, ids.length]));
    } catch (error) {
      if (!(error instanceof SnapshotTemplateMediaInvariantError)) throw error;
      slotCounts = "INVALID";
    }
  }

  return evaluateEditorReadiness({
    template: "SELECTED",
    manifest,
    requiredVariants: requiredInvitationVariantsForPackage(project.packageCodeSnapshot),
    weddingDetails,
    events,
    timelineItemCount: timeline.length,
    dressCode: dressCode === null ? null : { description: dressCode.dressCode.description, swatchCount: dressCode.swatches.length },
    hasAudio: media.some((row) => row.mediaType === "AUDIO"),
    slotCounts,
  });
}
