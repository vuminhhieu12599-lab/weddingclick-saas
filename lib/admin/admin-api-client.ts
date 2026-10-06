import type { InvitationVariant, MediaType, ProjectStatus, ServiceAddonCode, ServicePackageCode } from "../domain";
import type {
  FinalizeMediaResult,
  ProjectMediaRecord,
  UpdateProjectMediaResult,
  UploadIntentResult,
} from "../server/media/media-types";
import type { ProjectDressCodeWithSwatches } from "../server/project-dress-code/project-dress-code-gateway";
import type {
  ProjectDressCodeRecord,
  ProjectDressCodeSwatchRecord,
} from "../server/project-dress-code/project-dress-code-types";
import type { ProjectTimelineItemRecord } from "../server/project-timeline/project-timeline-types";
import type {
  AssignableStaffRecord,
  ProjectTaskPatch,
  ProjectTaskRecord,
} from "../server/project-tasks/project-task-types";
import type { ProjectActivityPage } from "../server/project-activity/project-activity-types";
import type { AdminDashboard } from "../server/dashboard/dashboard-types";
import type { AccessLinkInventoryItem } from "../server/access-links/access-link-inventory-types";

import type { CustomerRecord } from "../server/customers/customer-types";
import type { ProjectDesignRecord } from "../server/project-design/project-design-types";
import type {
  CreateProjectEventResult,
  ProjectEventInput,
  ProjectEventRecord,
  UpdateProjectEventResult,
} from "../server/project-events/project-events-types";
import type { ProjectSummary } from "../server/projects/project-types";
import type { CreatedReviewVersion, ProjectReviewState } from "../server/invitation-review/invitation-review-types";
import type { ProjectPublishState, PublishedInvitationVersion } from "../server/invitation-publish/invitation-publish-types";
import type { MarkPaidResult, TransitionStatusResult } from "../server/project-lifecycle/project-lifecycle-types";
import type { StaffInvitationPreviewBody } from "../server/routes/invitation-preview";
import type { ReviewVersionPreviewBody } from "../server/routes/invitation-review";
import type { StaffMeSuccessBody } from "../server/routes/staff-me";
import type { TemplateCatalogEntry } from "../server/templates/templates-types";
import type {
  SaveWeddingDetailsInput,
  SaveWeddingDetailsResult,
  WeddingDetailsRecord,
} from "../server/wedding-details/wedding-details-types";
import { AdminApiError } from "./admin-api-error";
import type { DesignAssignmentBody } from "./design-assignment";
import { readImageDimensions } from "./image-dimensions";
import { uploadToSignedMediaPath } from "./signed-media-upload";
import { getStaffAccessToken } from "./staff-session-client";

/**
 * Browser-side client for the V2 Admin UI (UI-001).
 *
 * Every function here calls an existing `/api/v2/internal/**` Route Handler
 * with the staff member's own Supabase Auth access token as a Bearer
 * credential — never a direct Supabase table query and never a service-role
 * credential (CLAUDE.md §13, docs/ARCHITECTURE.md §5).
 */

/**
 * `listProjects` has no cursor/offset pagination (lib/server/validation/pagination.ts
 * "V1 scope is deliberately simple — a bounded `limit` only"), so the Admin
 * UI requests the maximum allowed page instead of building pagination UI
 * against an API that doesn't support it. Counts/lists therefore reflect at
 * most this many of the most recently created projects — see the Dashboard
 * and Project List "known limitation" callouts.
 */
export const PROJECT_LIST_LIMIT = 100;

async function requireAccessToken(): Promise<string> {
  const token = await getStaffAccessToken();
  if (!token) {
    throw new AdminApiError(401, "Không tìm thấy phiên đăng nhập nhân sự");
  }
  return token;
}

async function requestJson<T>(
  path: string,
  accessToken: string,
  write?: { method: "PUT" | "POST" | "PATCH" | "DELETE"; body?: unknown },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      path,
      write
        ? write.body === undefined
          ? { method: write.method, headers: { authorization: `Bearer ${accessToken}` } }
          : {
              method: write.method,
              headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
              body: JSON.stringify(write.body),
            }
        : { headers: { authorization: `Bearer ${accessToken}` } },
    );
  } catch {
    throw new AdminApiError(0, "Không thể kết nối tới máy chủ");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AdminApiError(response.status, "Phản hồi không hợp lệ từ máy chủ");
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Đã xảy ra lỗi không xác định";
    throw new AdminApiError(response.status, message, body);
  }

  return body as T;
}

export async function fetchStaffMe(): Promise<StaffMeSuccessBody> {
  const token = await requireAccessToken();
  return requestJson<StaffMeSuccessBody>("/api/v2/internal/me", token);
}

export interface CreateCustomerBody {
  displayName: string;
  phone: string | null;
  email: string | null;
  contactNote: string | null;
}

export interface CreateProjectBody {
  customerId: string;
  packageCode: ServicePackageCode;
  addonCodes: ServiceAddonCode[];
}

export interface ListProjectsFilter {
  status?: ProjectStatus;
  /** Defaults to PROJECT_LIST_LIMIT. */
  limit?: number;
}

export async function fetchProjects(
  filter: ListProjectsFilter = {},
): Promise<ProjectSummary[]> {
  const token = await requireAccessToken();
  const params = new URLSearchParams({ limit: String(filter.limit ?? PROJECT_LIST_LIMIT) });
  if (filter.status) {
    params.set("status", filter.status);
  }
  return requestJson<ProjectSummary[]>(`/api/v2/internal/projects?${params.toString()}`, token);
}

/** Server-side dashboard aggregates (Task 034C) — exact counts, no 100-row browser cap. */
export async function fetchAdminDashboard(): Promise<AdminDashboard> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: AdminDashboard }>("/api/v2/internal/dashboard", token);
  return body.data;
}

/**
 * Launch Hardening 03 / P0-3: creates one Customer through the existing
 * Task 005 staff route. Only the four canonical input fields are sent;
 * `created_by` is always server-derived.
 */
export async function createCustomer(input: CreateCustomerBody): Promise<CustomerRecord> {
  const token = await requireAccessToken();
  return requestJson<CustomerRecord>("/api/v2/internal/customers", token, { method: "POST", body: input });
}

/**
 * Launch Hardening 03 / P0-3: creates one Project + initial add-ons through
 * the existing Task 005B route (atomic `create_project_with_addons`). Prices,
 * project code, status and payment state are server-derived; the body
 * carries business intent only.
 */
export async function createProject(input: CreateProjectBody): Promise<{ id: string }> {
  const token = await requireAccessToken();
  return requestJson<{ id: string }>("/api/v2/internal/projects", token, { method: "POST", body: input });
}

export async function fetchProjectById(projectId: string): Promise<ProjectSummary> {
  const token = await requireAccessToken();
  return requestJson<ProjectSummary>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}`,
    token,
  );
}

export async function fetchCustomerById(customerId: string): Promise<CustomerRecord> {
  const token = await requireAccessToken();
  return requestJson<CustomerRecord>(
    `/api/v2/internal/customers/${encodeURIComponent(customerId)}`,
    token,
  );
}

/** Read-only staff preview; signed media URLs in the result are runtime-only and never stored. */
export async function fetchStaffInvitationPreview(
  projectId: string,
  variant: InvitationVariant,
): Promise<StaffInvitationPreviewBody> {
  const token = await requireAccessToken();
  const params = new URLSearchParams({ variant });
  const body = await requestJson<{ data: StaffInvitationPreviewBody }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/preview?${params.toString()}`,
    token,
  );
  return body.data;
}

/** Task 030 staff review read model: required variants, current REVIEW versions, approval state. */
export async function fetchProjectReviewState(projectId: string): Promise<ProjectReviewState> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectReviewState }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/review`,
    token,
  );
  return body.data;
}

/**
 * Creates one immutable REVIEW version from the server's current draft.
 * Sends only the variant and the compare-and-set token; a 422 carries the
 * BLOCKED issues on `AdminApiError.body`.
 */
export async function createInvitationReviewVersion(
  projectId: string,
  variant: InvitationVariant,
  expectedCurrentReviewVersionId: string | null,
): Promise<CreatedReviewVersion> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: CreatedReviewVersion }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/review/versions`,
    token,
    { method: "POST", body: { variant, expectedCurrentReviewVersionId } },
  );
  return body.data;
}

/**
 * Issues one new customer REVIEW access link through the existing Task 026
 * staff route. The raw token is returned exactly once (no-store) and is
 * never persisted client-side; the caller shows it to staff to send.
 */
export async function issueReviewAccessLink(projectId: string): Promise<{ id: string; token: string }> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: { id: string; token: string } }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/access-links`,
    token,
    { method: "POST", body: { linkType: "REVIEW" } },
  );
  return { id: body.data.id, token: body.data.token };
}

/**
 * Task 033C: issues one new customer PORTAL access link through the same
 * existing Task 026 staff route (`linkType: "PORTAL"`). The raw token is
 * returned exactly once (no-store) and never persisted client-side.
 */
export async function issuePortalAccessLink(projectId: string): Promise<{ id: string; token: string }> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: { id: string; token: string } }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/access-links`,
    token,
    { method: "POST", body: { linkType: "PORTAL" } },
  );
  return { id: body.data.id, token: body.data.token };
}

/**
 * Task 033C: rotates one known access link through the existing Task 026
 * rotate route (old row revoked, replacement row issued atomically by
 * `rotate_access_link`). Returns the replacement id and raw token once.
 */
export async function rotateAccessLink(projectId: string, accessLinkId: string): Promise<{ id: string; token: string }> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: { id: string; token: string } }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/access-links/${encodeURIComponent(accessLinkId)}/rotate`,
    token,
    { method: "POST" },
  );
  return { id: body.data.id, token: body.data.token };
}

/**
 * Launch Hardening 02 / P0-1: every INTAKE/REVIEW/PORTAL link of the Project
 * (active first). Stable metadata only — a raw token is never recoverable.
 */
export async function fetchProjectAccessLinks(projectId: string): Promise<AccessLinkInventoryItem[]> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: AccessLinkInventoryItem[] }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/access-links`,
    token,
  );
  return body.data;
}

/**
 * Launch Hardening 02 / P0-1: revokes one access link of this Project through
 * the existing Task 026 revoke route (`revoke_access_link`). No restore exists.
 */
export async function revokeProjectAccessLink(projectId: string, accessLinkId: string): Promise<void> {
  const token = await requireAccessToken();
  await requestJson<{ data: { id: string } }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/access-links/${encodeURIComponent(accessLinkId)}/revoke`,
    token,
    { method: "POST" },
  );
}

/** Staff render of a persisted REVIEW Snapshot; runtime media URLs are never stored. */
export async function fetchReviewVersionPreview(projectId: string, versionId: string): Promise<ReviewVersionPreviewBody> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ReviewVersionPreviewBody }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/review/versions/${encodeURIComponent(versionId)}/preview`,
    token,
  );
  return body.data;
}

/** Task 031 staff publish read model: per required variant, approved current review, current publication, blocker. */
export async function fetchProjectPublishState(projectId: string): Promise<ProjectPublishState> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectPublishState }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/publish`,
    token,
  );
  return body.data;
}

/**
 * Publishes one required variant's approved current REVIEW as a new
 * immutable PUBLISHED version. Sends only the variant and the two
 * compare-and-set tokens; a 409 carries the stable `reason` on
 * `AdminApiError.body`.
 */
export async function publishInvitationVariant(
  projectId: string,
  variant: InvitationVariant,
  expectedCurrentReviewVersionId: string,
  expectedPublishedVersionId: string | null,
): Promise<PublishedInvitationVersion> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: PublishedInvitationVersion }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/publish`,
    token,
    { method: "POST", body: { variant, expectedCurrentReviewVersionId, expectedPublishedVersionId } },
  );
  return body.data;
}

/**
 * Task 025 lifecycle transition (PATCH /status). The edge graph and the
 * AWAITING_PAYMENT -> READY_TO_PUBLISH payment precondition stay
 * exclusively server/RPC-enforced.
 */
export async function transitionProjectStatus(
  projectId: string,
  targetStatus: ProjectStatus,
): Promise<TransitionStatusResult> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: TransitionStatusResult }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/status`,
    token,
    { method: "PATCH", body: { targetStatus } },
  );
  return body.data;
}

/** Task 025 narrow payment command (PATCH /payment, fixed `MARK_PAID` action only). */
export async function markProjectPaid(projectId: string): Promise<MarkPaidResult> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: MarkPaidResult }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/payment`,
    token,
    { method: "PATCH", body: { action: "MARK_PAID" } },
  );
  return body.data;
}

/** Complete staff template catalog (§13.1); `selectable` is server-derived. */
export async function fetchTemplateCatalog(): Promise<TemplateCatalogEntry[]> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: TemplateCatalogEntry[] }>("/api/v2/internal/templates", token);
  return body.data;
}

/** Current mutable design selection (§13.2); `null` when none is assigned yet. */
export async function fetchProjectDesign(projectId: string): Promise<ProjectDesignRecord | null> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectDesignRecord | null }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/design`,
    token,
  );
  return body.data;
}

/** Existing validated design upsert (§13.3). Draft design only — never publishes. */
export async function saveProjectDesign(
  projectId: string,
  input: DesignAssignmentBody,
): Promise<ProjectDesignRecord> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectDesignRecord }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/design`,
    token,
    { method: "PUT", body: input },
  );
  return body.data;
}

/** Canonical wedding details (Task 022); `null` when the Project has none yet. */
export async function fetchWeddingDetails(projectId: string): Promise<WeddingDetailsRecord | null> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: WeddingDetailsRecord | null }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/wedding-details`,
    token,
  );
  return body.data;
}

/** Existing full canonical Save (Task 022). Draft data only — never publishes. */
export async function saveWeddingDetails(
  projectId: string,
  input: SaveWeddingDetailsInput,
): Promise<SaveWeddingDetailsResult> {
  const token = await requireAccessToken();
  return requestJson<SaveWeddingDetailsResult>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/wedding-details`,
    token,
    { method: "PUT", body: input },
  );
}

export async function fetchProjectEvents(projectId: string): Promise<ProjectEventRecord[]> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectEventRecord[] }>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/events`,
    token,
  );
  return body.data;
}

/** Existing create business action (Task 023). */
export async function createProjectEvent(
  projectId: string,
  input: ProjectEventInput,
): Promise<CreateProjectEventResult> {
  const token = await requireAccessToken();
  return requestJson<CreateProjectEventResult>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/events`,
    token,
    { method: "POST", body: input },
  );
}

/** Existing full-resource update business action (Task 023). */
export async function updateProjectEvent(
  projectId: string,
  eventId: string,
  input: ProjectEventInput,
): Promise<UpdateProjectEventResult> {
  const token = await requireAccessToken();
  return requestJson<UpdateProjectEventResult>(
    `/api/v2/internal/projects/${encodeURIComponent(projectId)}/events/${encodeURIComponent(eventId)}`,
    token,
    { method: "PUT", body: input },
  );
}

function projectPath(projectId: string, suffix: string): string {
  return `/api/v2/internal/projects/${encodeURIComponent(projectId)}/${suffix}`;
}

// ---------------------------------------------------------------------------
// Project media (Task 024 trusted workflow — reused, never duplicated)
// ---------------------------------------------------------------------------

export async function fetchProjectMedia(projectId: string): Promise<ProjectMediaRecord[]> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectMediaRecord[] }>(projectPath(projectId, "media"), token);
  return body.data;
}

/**
 * The existing Task 024 upload sequence: server upload-intent (server-owned
 * path + signed-upload token) → the browser's own direct upload to that
 * signed path → server finalize (Storage metadata re-verified server-side,
 * row inserted under staff RLS). Image roles also send their natural
 * dimensions, decoded locally; the server validates them. Never a client-chosen path, never an
 * elevated credential. Resolves only once the row is confirmed.
 */
export async function uploadProjectMedia(
  projectId: string,
  mediaType: MediaType,
  file: File,
  sortOrder: number,
): Promise<ProjectMediaRecord> {
  const token = await requireAccessToken();
  // Image roles only: real natural dimensions drive orientation-aware layouts (never AUDIO).
  const dimensions = mediaType === "AUDIO" ? null : await readImageDimensions(file);
  const intent = await requestJson<UploadIntentResult>(projectPath(projectId, "media/upload-intent"), token, {
    method: "POST",
    body: { mediaType, mimeType: file.type, sizeBytes: file.size },
  });

  if (!(await uploadToSignedMediaPath(intent.bucket, intent.storagePath, intent.token, file))) {
    throw new AdminApiError(0, "Tải tệp lên kho lưu trữ thất bại");
  }

  const finalized = await requestJson<FinalizeMediaResult>(projectPath(projectId, "media/finalize"), token, {
    method: "POST",
    body: {
      mediaType,
      storagePath: intent.storagePath,
      altText: null,
      sortOrder,
      ...(dimensions === null ? {} : { width: dimensions.width, height: dimensions.height }),
    },
  });
  return finalized.media;
}

export async function updateProjectMediaSortOrder(
  projectId: string,
  mediaId: string,
  sortOrder: number,
): Promise<ProjectMediaRecord> {
  const token = await requireAccessToken();
  const body = await requestJson<UpdateProjectMediaResult>(
    projectPath(projectId, `media/${encodeURIComponent(mediaId)}`),
    token,
    { method: "PATCH", body: { sortOrder } },
  );
  return body.media;
}

export async function deleteProjectMedia(projectId: string, mediaId: string): Promise<void> {
  const token = await requireAccessToken();
  await requestJson<{ deleted: true }>(projectPath(projectId, `media/${encodeURIComponent(mediaId)}`), token, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineItemBody {
  time: string;
  label: string;
  sortOrder: number;
}

export async function fetchProjectTimeline(projectId: string): Promise<ProjectTimelineItemRecord[]> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectTimelineItemRecord[] }>(projectPath(projectId, "timeline"), token);
  return body.data;
}

export async function createProjectTimelineItem(
  projectId: string,
  input: TimelineItemBody,
): Promise<ProjectTimelineItemRecord> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectTimelineItemRecord }>(projectPath(projectId, "timeline"), token, {
    method: "POST",
    body: input,
  });
  return body.data;
}

export async function updateProjectTimelineItem(
  projectId: string,
  itemId: string,
  patch: Partial<TimelineItemBody>,
): Promise<ProjectTimelineItemRecord> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectTimelineItemRecord }>(
    projectPath(projectId, `timeline/${encodeURIComponent(itemId)}`),
    token,
    { method: "PATCH", body: patch },
  );
  return body.data;
}

export async function deleteProjectTimelineItem(projectId: string, itemId: string): Promise<void> {
  const token = await requireAccessToken();
  await requestJson<{ deleted: true }>(projectPath(projectId, `timeline/${encodeURIComponent(itemId)}`), token, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Project Tasks (Task 034A — staff-only operational tasks)
// ---------------------------------------------------------------------------

export interface CreateProjectTaskBody {
  title: string;
  dueAt: string | null;
  assignedStaffId: string | null;
}

export async function fetchProjectTasks(projectId: string): Promise<ProjectTaskRecord[]> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectTaskRecord[] }>(projectPath(projectId, "tasks"), token);
  return body.data;
}

export async function fetchTaskAssignees(projectId: string): Promise<AssignableStaffRecord[]> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: AssignableStaffRecord[] }>(projectPath(projectId, "tasks/assignees"), token);
  return body.data;
}

export async function createProjectTask(projectId: string, input: CreateProjectTaskBody): Promise<ProjectTaskRecord> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectTaskRecord }>(projectPath(projectId, "tasks"), token, {
    method: "POST",
    body: input,
  });
  return body.data;
}

export async function updateProjectTask(
  projectId: string,
  taskId: string,
  patch: ProjectTaskPatch,
): Promise<ProjectTaskRecord> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectTaskRecord }>(
    projectPath(projectId, `tasks/${encodeURIComponent(taskId)}`),
    token,
    { method: "PATCH", body: patch },
  );
  return body.data;
}

export async function deleteProjectTask(projectId: string, taskId: string): Promise<void> {
  const token = await requireAccessToken();
  await requestJson<{ deleted: true }>(projectPath(projectId, `tasks/${encodeURIComponent(taskId)}`), token, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Project Activity (Task 034B — staff read-only audit history)
// ---------------------------------------------------------------------------

/** One newest-first page; pass the previous page's `nextCursor` for older rows. */
export async function fetchProjectActivity(projectId: string, cursor: string | null = null): Promise<ProjectActivityPage> {
  const token = await requireAccessToken();
  const suffix = cursor === null ? "activity" : `activity?${new URLSearchParams({ cursor }).toString()}`;
  const body = await requestJson<{ data: ProjectActivityPage }>(projectPath(projectId, suffix), token);
  return body.data;
}

// ---------------------------------------------------------------------------
// Dress Code
// ---------------------------------------------------------------------------

export async function fetchProjectDressCode(projectId: string): Promise<ProjectDressCodeWithSwatches | null> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectDressCodeWithSwatches | null }>(projectPath(projectId, "dress-code"), token);
  return body.data;
}

export async function saveProjectDressCode(projectId: string, description: string | null): Promise<ProjectDressCodeRecord> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectDressCodeRecord }>(projectPath(projectId, "dress-code"), token, {
    method: "PUT",
    body: { description },
  });
  return body.data;
}

export async function createDressCodeSwatch(
  projectId: string,
  input: { color: string; sortOrder: number },
): Promise<ProjectDressCodeSwatchRecord> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectDressCodeSwatchRecord }>(
    projectPath(projectId, "dress-code/swatches"),
    token,
    { method: "POST", body: input },
  );
  return body.data;
}

export async function updateDressCodeSwatch(
  projectId: string,
  swatchId: string,
  patch: { color?: string; sortOrder?: number },
): Promise<ProjectDressCodeSwatchRecord> {
  const token = await requireAccessToken();
  const body = await requestJson<{ data: ProjectDressCodeSwatchRecord }>(
    projectPath(projectId, `dress-code/swatches/${encodeURIComponent(swatchId)}`),
    token,
    { method: "PATCH", body: patch },
  );
  return body.data;
}

export async function deleteDressCodeSwatch(projectId: string, swatchId: string): Promise<void> {
  const token = await requireAccessToken();
  await requestJson<{ deleted: true }>(
    projectPath(projectId, `dress-code/swatches/${encodeURIComponent(swatchId)}`),
    token,
    { method: "DELETE" },
  );
}
