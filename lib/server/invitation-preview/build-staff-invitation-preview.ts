import { INVITATION_VARIANTS, type InvitationVariant } from "../../domain";
import { buildInvitationViewModel } from "../../invitation-rendering/build-invitation-view-model";
import { buildSnapshotPayload } from "../../invitation-rendering/build-snapshot-payload";
import { extractSnapshotMediaRefs } from "../../invitation-rendering/extract-snapshot-media-refs";
import type { InvitationViewModel, MediaResolver } from "../../invitation-rendering/invitation-view-model-types";
import type { RendererCompatibilityRegistry } from "../../invitation-rendering/renderer-registry";
import {
  selectRendererCompatibility,
  type RendererEffectiveSections,
} from "../../invitation-rendering/renderer-selection";
import { resolveSnapshotMedia } from "../../invitation-rendering/resolve-snapshot-media";
import type { SnapshotPayloadIssue, SnapshotPayloadV1 } from "../../invitation-rendering/snapshot-payload-types";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import {
  loadSnapshotPayloadInput,
  type SnapshotContentSourceGateways,
} from "../invitation-snapshot/load-snapshot-payload-input";
import type { ProjectDesignGateway } from "../project-design/project-design-gateway";
import type { ProjectEventsGateway } from "../project-events/project-events-gateway";
import type { ProjectGateway } from "../projects/project-gateway";
import { isValidUuid } from "../validation/uuid";
import type { WeddingDetailsGateway } from "../wedding-details/wedding-details-gateway";
import type { TemplateVersionBindingGateway } from "./template-version-binding-gateway";

/** Thrown when a staff-scoped load returns a record bound to a different Project or template version. */
export class StaffInvitationPreviewInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffInvitationPreviewInvariantError";
  }
}

export interface StaffInvitationPreviewDependencies<TClient> extends SnapshotContentSourceGateways<TClient> {
  projects: Pick<ProjectGateway<TClient>, "getProjectById">;
  weddingDetails: Pick<WeddingDetailsGateway<TClient>, "getWeddingDetailsByProjectId">;
  events: Pick<ProjectEventsGateway<TClient>, "listProjectEvents">;
  design: Pick<ProjectDesignGateway<TClient>, "getCurrentProjectDesign">;
  templateVersions: TemplateVersionBindingGateway<TClient>;
  /** Preloads runtime media for exactly `mediaIds` with the staff client (no elevated credential). */
  createMediaResolver(client: TClient, projectId: string, mediaIds: readonly string[]): Promise<MediaResolver>;
  /** The RF-04 compatibility registry; exact-key lookup only, no fallback. */
  rendererRegistry: RendererCompatibilityRegistry;
}

/** Renderer-ready preview data: exactly the serializable inputs of `InvitationRendererHost`, plus the Snapshot. */
export interface StaffInvitationPreviewReady {
  status: "READY";
  /** Ephemeral, in-memory only: never persisted; carries stable media ids, never URLs. */
  snapshot: SnapshotPayloadV1;
  /** Carries the runtime-only resolved media (signed URLs live only here). */
  viewModel: InvitationViewModel;
  rendererKey: string;
  sections: RendererEffectiveSections;
}

/** The canonical data cannot produce a Snapshot yet; the frozen builder issues are returned unchanged. */
export interface StaffInvitationPreviewBlocked {
  status: "BLOCKED";
  issues: [SnapshotPayloadIssue, ...SnapshotPayloadIssue[]];
}

export type StaffInvitationPreviewResult = StaffInvitationPreviewReady | StaffInvitationPreviewBlocked;

function isInvitationVariant(value: unknown): value is InvitationVariant {
  return typeof value === "string" && (INVITATION_VARIANTS as readonly string[]).includes(value);
}

/**
 * Staff preview use case: composes the frozen pipeline over real Project
 * data for one variant —
 *
 * canonical loads (staff RLS) → `loadSnapshotPayloadInput` (media, Timeline,
 * Dress Code) → `buildSnapshotPayload` (in memory) → media refs → injected
 * staff-scoped MediaResolver → `buildInvitationViewModel` →
 * `selectRendererCompatibility` (fail-closed).
 *
 * Preview only: nothing is written (no `invitation_versions`, no publish),
 * and the Snapshot is never persisted. The renderer key comes only from the
 * `template_versions` row the design pins — never inferred, defaulted or
 * substituted. Every staff-scoped read runs under RLS, so a caller who
 * cannot read the Project sees NOT_FOUND. Load, resolver, consistency and
 * renderer-selection failures propagate unchanged and are never turned
 * into empty preview data.
 */
export async function buildStaffInvitationPreview<TClient>(
  rawProjectId: string,
  rawVariant: string,
  staff: StaffContext<TClient>,
  deps: StaffInvitationPreviewDependencies<TClient>,
): Promise<StaffInvitationPreviewResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  if (!isInvitationVariant(rawVariant)) {
    throw new ApiError("BAD_REQUEST", "Variant must be COMMON, GROOM or BRIDE");
  }
  const projectId = rawProjectId;
  const client = staff.supabase;

  const project = await deps.projects.getProjectById(client, projectId);
  if (project === null) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }
  if (project.id !== projectId) {
    throw new StaffInvitationPreviewInvariantError("Loaded project does not match the requested Project");
  }

  const [weddingDetails, events, design] = await Promise.all([
    deps.weddingDetails.getWeddingDetailsByProjectId(client, projectId),
    deps.events.listProjectEvents(client, projectId),
    deps.design.getCurrentProjectDesign(client, projectId),
  ]);
  if (design === null) {
    throw new ApiError("CONFLICT", "Project design is not configured");
  }
  if (design.projectId !== projectId) {
    throw new StaffInvitationPreviewInvariantError("Project design belongs to a different Project");
  }

  const templateVersion = await deps.templateVersions.getTemplateVersionBinding(client, design.templateVersionId);
  if (templateVersion === null) {
    // template_versions FK guarantees the row; invisibility is an integrity/RLS fault, not absence.
    throw new StaffInvitationPreviewInvariantError("Project design's template version could not be loaded");
  }
  if (templateVersion.id !== design.templateVersionId) {
    throw new StaffInvitationPreviewInvariantError("Loaded template version does not match the Project design");
  }

  // Remaining same-Project checks (details, events, media, Timeline, Dress Code) are the frozen builder's invariants.
  const input = await loadSnapshotPayloadInput(
    {
      project: { id: project.id, projectCode: project.projectCode },
      variant: rawVariant,
      weddingDetails,
      events,
      design,
      templateVersion: { id: templateVersion.id, rendererKey: templateVersion.rendererKey },
    },
    staff,
    deps,
  );

  const built = buildSnapshotPayload(input);
  if (built.status !== "SUCCESS") {
    return { status: "BLOCKED", issues: built.issues };
  }
  const snapshot = built.payload;

  const resolver = await deps.createMediaResolver(client, projectId, extractSnapshotMediaRefs(snapshot));
  const mediaResolutions = await resolveSnapshotMedia(snapshot, resolver);
  const viewModel = buildInvitationViewModel({ snapshot, mediaResolutions });
  const selection = selectRendererCompatibility({ snapshot, viewModel, registry: deps.rendererRegistry });

  return {
    status: "READY",
    snapshot,
    viewModel,
    rendererKey: selection.rendererKey,
    sections: selection.effectiveSections,
  };
}
