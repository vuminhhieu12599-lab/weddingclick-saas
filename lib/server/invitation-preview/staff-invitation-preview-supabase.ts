import type { SupabaseClient } from "@supabase/supabase-js";

import { lookupTemplateEditorManifest } from "../../../templates/core/production-editor-manifests";
import { PRODUCTION_COMPATIBILITY_REGISTRY } from "../../../templates/core/production-renderer-manifests";
import { supabaseProjectDesignGateway } from "../supabase/project-design-repository";
import { supabaseProjectDressCodeGateway } from "../supabase/project-dress-code-repository";
import { supabaseProjectEventsGateway } from "../supabase/project-events-repository";
import { supabaseProjectMediaGateway } from "../supabase/project-media-repository";
import { supabaseProjectGateway } from "../supabase/project-repository";
import { supabaseProjectTimelineGateway } from "../supabase/project-timeline-repository";
import { createSupabaseMediaResolver } from "../supabase/supabase-media-resolver";
import { supabaseTemplateMediaSlotGateway } from "../supabase/template-media-slot-repository";
import { supabaseTemplateVersionBindingGateway } from "../supabase/template-version-binding-repository";
import { supabaseWeddingDetailsGateway } from "../supabase/wedding-details-repository";
import type { StaffInvitationPreviewDependencies } from "./build-staff-invitation-preview";

/**
 * Production wiring for `buildStaffInvitationPreview`: the existing
 * staff-scoped Supabase gateways, the staff-context MediaResolver and the
 * server-safe production compatibility registry. Every call receives the
 * StaffContext's own JWT-scoped client; no elevated credential exists here.
 */
export const supabaseStaffInvitationPreviewDependencies: StaffInvitationPreviewDependencies<SupabaseClient> = {
  projects: supabaseProjectGateway,
  weddingDetails: supabaseWeddingDetailsGateway,
  events: supabaseProjectEventsGateway,
  design: supabaseProjectDesignGateway,
  templateVersions: supabaseTemplateVersionBindingGateway,
  media: supabaseProjectMediaGateway,
  timeline: supabaseProjectTimelineGateway,
  dressCode: supabaseProjectDressCodeGateway,
  templateSlots: supabaseTemplateMediaSlotGateway,
  lookupEditorManifest: lookupTemplateEditorManifest,
  createMediaResolver: createSupabaseMediaResolver,
  rendererRegistry: PRODUCTION_COMPATIBILITY_REGISTRY.compatibility,
};
