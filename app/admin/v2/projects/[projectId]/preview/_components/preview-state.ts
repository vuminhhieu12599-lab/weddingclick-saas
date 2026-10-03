import { INVITATION_VARIANTS, type InvitationVariant } from "../../../../../../../lib/domain";
import { AdminApiError } from "../../../../../../../lib/admin/admin-api-error";
import type { StaffInvitationPreviewBody } from "../../../../../../../lib/server/routes/invitation-preview";

/** UI-only selection; never persisted. Matches the server default. */
export const DEFAULT_PREVIEW_VARIANT: InvitationVariant = "COMMON";

export const PREVIEW_VARIANT_LABELS: Readonly<Record<InvitationVariant, string>> = {
  COMMON: "Thiệp chung",
  GROOM: "Nhà trai",
  BRIDE: "Nhà gái",
};

/** `?variant=` absent → COMMON; any value other than the three variants → `null` (never guessed). */
export function parsePreviewVariant(raw: string | null): InvitationVariant | null {
  if (raw === null) {
    return DEFAULT_PREVIEW_VARIANT;
  }
  return (INVITATION_VARIANTS as readonly string[]).includes(raw) ? (raw as InvitationVariant) : null;
}

export type PreviewState =
  | StaffInvitationPreviewBody
  | { status: "INVALID_VARIANT" }
  | { status: "NO_DESIGN" }
  | { status: "NOT_FOUND" }
  | { status: "ERROR"; message: string; retryable: boolean };

/**
 * Maps the backend error model (docs/API_CONTRACT.md §5) to staff-facing
 * states. Server messages are not shown: every message here is a fixed
 * Vietnamese string, so no internal detail can reach the page.
 */
export function previewErrorState(error: unknown): PreviewState {
  if (error instanceof AdminApiError) {
    switch (error.status) {
      case 400:
        return { status: "ERROR", message: "Yêu cầu xem trước không hợp lệ.", retryable: false };
      case 401:
        return { status: "ERROR", message: "Phiên đăng nhập nhân sự đã hết hạn. Vui lòng đăng nhập lại.", retryable: false };
      case 403:
        return { status: "ERROR", message: "Tài khoản không có quyền xem trước dự án này.", retryable: false };
      case 404:
        return { status: "NOT_FOUND" };
      case 409:
        return { status: "NO_DESIGN" };
    }
  }
  return { status: "ERROR", message: "Không thể tạo bản xem trước lúc này. Vui lòng thử lại.", retryable: true };
}

export async function loadPreviewState(
  projectId: string,
  variant: InvitationVariant | null,
  fetchPreview: (projectId: string, variant: InvitationVariant) => Promise<StaffInvitationPreviewBody>,
): Promise<PreviewState> {
  if (variant === null) {
    return { status: "INVALID_VARIANT" };
  }
  try {
    return await fetchPreview(projectId, variant);
  } catch (error) {
    return previewErrorState(error);
  }
}
