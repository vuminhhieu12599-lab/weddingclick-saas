import { supabase } from "../supabase";

/**
 * The browser half of the existing Task 024 upload workflow
 * (docs/API_CONTRACT.md §3.2): uploads the file to the server-issued,
 * server-generated signed path using the server-issued one-time token. The
 * browser never chooses the bucket/path and never inserts a project_media
 * row — finalize (server) re-verifies Storage metadata and inserts the row.
 * Kept separate so the API client itself never touches Supabase.
 */
export async function uploadToSignedMediaPath(
  bucket: string,
  storagePath: string,
  token: string,
  file: File,
): Promise<boolean> {
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(storagePath, token, file, { contentType: file.type });
  return error === null;
}
