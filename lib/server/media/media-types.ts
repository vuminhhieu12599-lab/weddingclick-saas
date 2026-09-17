import type { MediaType } from "../../domain";
import type { PROJECT_MEDIA_BUCKET } from "./media-constants";

/**
 * Project Media upload workflow shapes (Task 024 Phase 2 §0/§9).
 *
 * `UploadIntentInput`/`FinalizeMediaInput` are the validated, camelCase
 * request shapes the use cases work with — never the raw request body.
 * `ProjectMediaRecord` mirrors migration 0007_project_media.sql exactly —
 * no invented fields. `width`/`height` are always `null` in Phase 2 (no
 * image-dimension processing — see finalize-media.ts).
 */
export interface UploadIntentInput {
  mediaType: MediaType;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadIntentResult {
  bucket: typeof PROJECT_MEDIA_BUCKET;
  storagePath: string;
  token: string;
}

export interface FinalizeMediaInput {
  mediaType: MediaType;
  storagePath: string;
  altText: string | null;
  sortOrder: number;
}

export interface ProjectMediaRecord {
  id: string;
  projectId: string;
  mediaType: MediaType;
  storageBucket: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  altText: string | null;
  sortOrder: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinalizeMediaResult {
  media: ProjectMediaRecord;
}

/**
 * Task 024 Phase 3 — validated PATCH payload. Optional keys are used to
 * preserve field-presence (absent vs. explicitly provided) rather than
 * collapsing "not sent" and "sent as its default" into the same shape —
 * `updateProjectMedia`/the repository build the SQL UPDATE from exactly
 * the keys present here, never a full-row read-modify-write (see
 * update-project-media.ts).
 */
export interface UpdateProjectMediaPatch {
  altText?: string | null;
  sortOrder?: number;
}

export interface UpdateProjectMediaResult {
  media: ProjectMediaRecord;
}

export interface DeleteProjectMediaResult {
  deleted: true;
}
