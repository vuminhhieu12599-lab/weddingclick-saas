import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseStaffInvitationPreviewDependencies } from "../invitation-preview/staff-invitation-preview-supabase";
import { supabaseProjectMediaGateway } from "../supabase/project-media-repository";
import { createSupabaseMediaResolver } from "../supabase/supabase-media-resolver";
import type { EditorReadinessDependencies } from "./load-editor-readiness";
import type { PhotoLibraryDependencies } from "./photo-library";

/**
 * Production wiring for the TE-05A Staff editor reads: the existing
 * staff-scoped gateways and the staff-scoped batch media signer. No
 * elevated credential anywhere.
 */
export const supabasePhotoLibraryDependencies: PhotoLibraryDependencies<SupabaseClient> = {
  media: supabaseProjectMediaGateway,
  createMediaResolver: createSupabaseMediaResolver,
};

export const supabaseEditorReadinessDependencies: EditorReadinessDependencies<SupabaseClient> = supabaseStaffInvitationPreviewDependencies;
