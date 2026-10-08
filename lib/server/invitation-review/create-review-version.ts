import { INVITATION_VARIANTS, type InvitationVariant } from "../../domain";
import { extractSnapshotMediaRefs } from "../../invitation-rendering/extract-snapshot-media-refs";
import { RendererSelectionError } from "../../invitation-rendering/renderer-selection-errors";
import type { SnapshotPayloadIssue, SnapshotPayloadV1 } from "../../invitation-rendering/snapshot-payload-types";
import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import {
  composeStaffInvitationRender,
  loadStaffDraftSnapshot,
  type StaffInvitationPreviewDependencies,
} from "../invitation-preview/build-staff-invitation-preview";
import { isValidUuid } from "../validation/uuid";
import type { InvitationReviewGateway } from "./invitation-review-gateway";
import type { CreatedReviewVersion } from "./invitation-review-types";

/** The complete browser command: which variant, and the compare-and-set token. Nothing authoritative. */
export interface CreateReviewVersionCommand {
  variant: InvitationVariant;
  /** The current review version the staff member saw (`null` = none yet); stale → CONFLICT. */
  expectedCurrentReviewVersionId: string | null;
}

export type CreateReviewVersionResult =
  | { status: "CREATED"; version: CreatedReviewVersion }
  | { status: "BLOCKED"; issues: [SnapshotPayloadIssue, ...SnapshotPayloadIssue[]] };

export interface CreateReviewVersionDependencies<TClient> extends StaffInvitationPreviewDependencies<TClient> {
  reviews: Pick<InvitationReviewGateway<TClient>, "createReviewVersion">;
}

const COMMAND_KEYS: ReadonlySet<string> = new Set(["variant", "expectedCurrentReviewVersionId"]);

/**
 * Strict allow-list parse: any other key (a Snapshot, renderer key,
 * template version, media list, …) is rejected, so the browser can never
 * supply an authoritative value — not even one the server would ignore.
 */
export function parseCreateReviewVersionCommand(raw: unknown): CreateReviewVersionCommand {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ApiError("BAD_REQUEST", "Request body must be a JSON object");
  }
  for (const key of Object.keys(raw)) {
    if (!COMMAND_KEYS.has(key)) {
      throw new ApiError("BAD_REQUEST", `Unexpected field: ${key}`);
    }
  }
  const { variant, expectedCurrentReviewVersionId } = raw as Record<string, unknown>;
  if (typeof variant !== "string" || !(INVITATION_VARIANTS as readonly string[]).includes(variant)) {
    throw new ApiError("BAD_REQUEST", "variant must be COMMON, GROOM or BRIDE");
  }
  if (
    expectedCurrentReviewVersionId !== null &&
    (typeof expectedCurrentReviewVersionId !== "string" || !isValidUuid(expectedCurrentReviewVersionId))
  ) {
    throw new ApiError("BAD_REQUEST", "expectedCurrentReviewVersionId must be a UUID or null");
  }
  return { variant: variant as InvitationVariant, expectedCurrentReviewVersionId };
}

/** Storage signing paths that must never be persisted (runtime-only media URLs). */
const FORBIDDEN_PERSISTED_MARKERS = ["/storage/v1/object/sign/", "/storage/v1/object/public/"] as const;

/**
 * Defense in depth before persistence: the frozen builder never emits URLs
 * for media, but a persisted REVIEW Snapshot must provably contain no
 * signed/storage URL or token material. Throws (500) — a server defect.
 */
export function assertSnapshotHasNoSignedUrls(snapshot: SnapshotPayloadV1): void {
  const serialized = JSON.stringify(snapshot);
  for (const marker of FORBIDDEN_PERSISTED_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error("Review Snapshot contains runtime media URL material");
    }
  }
}

/**
 * Task 030 — create one immutable REVIEW version for one variant from the
 * CURRENT canonical draft:
 *
 * strict command parse → `loadStaffDraftSnapshot` (the same frozen
 * pipeline Staff Preview uses) → BLOCKED returns issues and writes nothing
 * → `composeStaffInvitationRender` proves the exact pinned renderer can
 * serve this Snapshot (fail closed; the runtime ViewModel/URLs are
 * discarded, never persisted) → URL-free assertion → media refs from the
 * frozen extractor → `create_review_version` (atomic: ensure required
 * invitation rows, append REVIEW, pin media, advance pointer, audit).
 *
 * The template version and renderer key come only from the Snapshot the
 * server built from the pinned `project_design` → `template_versions` row;
 * the RPC re-checks them against the live design.
 */
export async function createReviewVersion<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  deps: CreateReviewVersionDependencies<TClient>,
): Promise<CreateReviewVersionResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const command = parseCreateReviewVersionCommand(rawBody);

  // TE-04: an unregistered renderer can now fail already while loading the
  // draft (no editor manifest); it maps exactly like a compose failure.
  let draft: Awaited<ReturnType<typeof loadStaffDraftSnapshot>>;
  try {
    draft = await loadStaffDraftSnapshot(rawProjectId, command.variant, staff, deps);
  } catch (error) {
    if (error instanceof RendererSelectionError) {
      throw new ApiError("INVARIANT", "The selected template cannot render this invitation");
    }
    throw error;
  }
  if (draft.status !== "SUCCESS") {
    return draft;
  }
  const snapshot = draft.snapshot;

  try {
    await composeStaffInvitationRender(snapshot, rawProjectId, staff.supabase, deps);
  } catch (error) {
    if (error instanceof RendererSelectionError) {
      throw new ApiError("INVARIANT", "The selected template cannot render this invitation");
    }
    throw error;
  }

  assertSnapshotHasNoSignedUrls(snapshot);

  const version = await deps.reviews.createReviewVersion(staff.supabase, {
    projectId: rawProjectId,
    variant: command.variant,
    expectedCurrentReviewVersionId: command.expectedCurrentReviewVersionId,
    templateVersionId: snapshot.template.templateVersionId,
    rendererKey: snapshot.template.rendererKey,
    payload: snapshot,
    mediaIds: extractSnapshotMediaRefs(snapshot),
  });

  if (version.projectId !== rawProjectId || version.variant !== command.variant) {
    throw new Error("Created review version does not match the request");
  }
  return { status: "CREATED", version };
}
