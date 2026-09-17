import type { StaffContext } from "../auth/staff-context";
import { ApiError } from "../errors/api-error";
import { isValidUuid } from "../validation/uuid";
import { PROJECT_MEDIA_BUCKET } from "./media-constants";
import { canonicalizeProjectId, generateMediaStoragePath } from "./generate-media-storage-path";
import type { MediaGateway } from "./media-gateway";
import type { UploadIntentResult } from "./media-types";
import { validateUploadIntentInput } from "./validate-upload-intent-input";

/**
 * Create-Upload-Intent use case (Task 024 Phase 2). Advisory validation
 * only, then issues a signed-upload token for a fresh, server-generated,
 * project-scoped path — never a plain RLS INSERT and never an RPC (there
 * is nothing to persist yet; the project_media row is created only by
 * finalize-media.ts after the browser's own direct upload succeeds).
 */
export async function createUploadIntent<TClient>(
  rawProjectId: string,
  rawBody: unknown,
  staff: StaffContext<TClient>,
  gateway: MediaGateway<TClient>,
): Promise<UploadIntentResult> {
  if (!isValidUuid(rawProjectId)) {
    throw new ApiError("BAD_REQUEST", "Project id must be a valid UUID");
  }
  const projectId = canonicalizeProjectId(rawProjectId);

  const exists = await gateway.projectExists(staff.supabase, projectId);
  if (!exists) {
    throw new ApiError("NOT_FOUND", "Project not found");
  }

  validateUploadIntentInput(rawBody);

  const storagePath = generateMediaStoragePath(projectId);
  const { token } = await gateway.createSignedUploadPath(staff.supabase, storagePath);

  return { bucket: PROJECT_MEDIA_BUCKET, storagePath, token };
}
