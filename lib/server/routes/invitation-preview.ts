import type { InvitationVariant } from "../../domain";
import type { InvitationViewModel } from "../../invitation-rendering/invitation-view-model-types";
import type { RendererEffectiveSections } from "../../invitation-rendering/renderer-selection";
import type { SnapshotPayloadIssue } from "../../invitation-rendering/snapshot-payload-types";
import { parseBearerToken } from "../auth/bearer-token";
import { StaffAuthError } from "../auth/staff-auth-error";
import { requireStaff, type StaffAuthGateway } from "../auth/staff-context";
import { ApiError, apiErrorStatus } from "../errors/api-error";
import {
  buildStaffInvitationPreview,
  type StaffInvitationPreviewDependencies,
} from "../invitation-preview/build-staff-invitation-preview";

/**
 * Pure, framework-agnostic handler backing the staff invitation preview
 * endpoint — mirrors lib/server/routes/project-design.ts's
 * no-store/error-mapping conventions. Read-only: it only calls the frozen
 * `buildStaffInvitationPreview` use case, which never writes.
 */
export interface ApiResult<TBody> {
  status: 200 | 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500;
  body: TBody | { error: string };
  headers?: Record<string, string>;
}

/** The variant previewed when the request carries no `variant` parameter. */
export const DEFAULT_PREVIEW_VARIANT: InvitationVariant = "COMMON";

/**
 * Exactly the `InvitationRendererHost` inputs. The in-memory Snapshot is
 * deliberately not returned: the renderer never needs it, and the
 * resolved (runtime-only) media URLs already live in the ViewModel.
 */
export type StaffInvitationPreviewBody =
  | {
      status: "READY";
      rendererKey: string;
      viewModel: InvitationViewModel;
      sections: RendererEffectiveSections;
    }
  | { status: "BLOCKED"; issues: SnapshotPayloadIssue[] };

/** Signed media URLs in the body must never be cached by a browser or proxy. */
const NO_STORE_HEADERS: Readonly<Record<string, string>> = { "Cache-Control": "no-store" };

function withNoStore<T>(result: ApiResult<T>): ApiResult<T> {
  return { ...result, headers: { ...NO_STORE_HEADERS, ...result.headers } };
}

function toErrorResult(error: unknown, logLabel: string): ApiResult<never> {
  if (error instanceof StaffAuthError) {
    if (error.kind === "UNAUTHENTICATED") {
      return { status: 401, body: { error: error.message } };
    }
    if (error.kind === "FORBIDDEN") {
      return { status: 403, body: { error: error.message } };
    }
    return { status: 500, body: { error: "Internal server error" } };
  }

  if (error instanceof ApiError) {
    if (error.kind === "INTERNAL") {
      return { status: 500, body: { error: "Internal server error" } };
    }
    return { status: apiErrorStatus(error.kind), body: { error: error.message } };
  }

  // Invariant, loader, media-resolver and renderer-selection failures: fixed label, no detail.
  console.error(logLabel);
  return { status: 500, body: { error: "Internal server error" } };
}

/** GET /api/v2/internal/projects/[id]/preview?variant=COMMON|GROOM|BRIDE */
export async function handleGetStaffInvitationPreviewRequest<TClient>(
  authorizationHeader: string | null,
  projectId: string,
  rawVariant: string | null,
  authGateway: StaffAuthGateway<TClient>,
  deps: StaffInvitationPreviewDependencies<TClient>,
): Promise<ApiResult<{ data: StaffInvitationPreviewBody }>> {
  const token = parseBearerToken(authorizationHeader);
  if (!token) {
    return withNoStore<{ data: StaffInvitationPreviewBody }>({
      status: 401,
      body: { error: "Missing or malformed Authorization header" },
    });
  }

  try {
    const staff = await requireStaff(token, authGateway);
    // Variant validation stays in the frozen use case (BAD_REQUEST for anything else).
    const result = await buildStaffInvitationPreview(
      projectId,
      rawVariant ?? DEFAULT_PREVIEW_VARIANT,
      staff,
      deps,
    );

    const data: StaffInvitationPreviewBody =
      result.status === "READY"
        ? {
            status: "READY",
            rendererKey: result.rendererKey,
            viewModel: result.viewModel,
            sections: result.sections,
          }
        : { status: "BLOCKED", issues: result.issues };

    return withNoStore({ status: 200, body: { data } });
  } catch (error) {
    return withNoStore(toErrorResult(error, "[handleGetStaffInvitationPreviewRequest] Unexpected error"));
  }
}
