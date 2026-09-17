import { randomUUID } from "node:crypto";

/**
 * Canonicalizes an already-format-validated project UUID (isValidUuid) to
 * lowercase — the single form used both when generating a fresh Storage
 * path and when validating a finalize request's storagePath against it
 * (Task 024 Phase 2 §0/§2). Node's randomUUID() always produces lowercase
 * hex, so canonicalizing here keeps both path segments in one consistent
 * case for an exact string comparison later.
 */
export function canonicalizeProjectId(rawProjectId: string): string {
  return rawProjectId.toLowerCase();
}

/**
 * Server-generated Storage object path: `<canonicalProjectId>/<randomUUID()>`
 * (Task 024 Phase 2 §0). Never derived from client input — no filename, no
 * extension, no client-controlled path component — and always a fresh
 * value on every call, so repeated upload-intent requests never collide.
 */
export function generateMediaStoragePath(canonicalProjectId: string): string {
  return `${canonicalProjectId}/${randomUUID()}`;
}
