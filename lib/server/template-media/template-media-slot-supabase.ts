import type { SupabaseClient } from "@supabase/supabase-js";

import { lookupTemplateEditorManifest } from "../../../templates/core/production-editor-manifests";
import { supabaseProjectDesignGateway } from "../supabase/project-design-repository";
import { supabaseProjectGateway } from "../supabase/project-repository";
import { supabaseTemplateMediaSlotGateway } from "../supabase/template-media-slot-repository";
import { supabaseTemplateVersionBindingGateway } from "../supabase/template-version-binding-repository";
import type { SetTemplateMediaSlotDependencies } from "./set-template-media-slot";

/**
 * Production wiring for `setTemplateMediaSlot` (TE-03B): the existing
 * staff-scoped gateways, the migration 0046 slot gateway and the
 * server-safe production editor registry (TE-02). No elevated credential.
 */
export const supabaseSetTemplateMediaSlotDependencies: SetTemplateMediaSlotDependencies<SupabaseClient> = {
  projects: supabaseProjectGateway,
  design: supabaseProjectDesignGateway,
  templateVersions: supabaseTemplateVersionBindingGateway,
  slots: supabaseTemplateMediaSlotGateway,
  lookupEditorManifest: lookupTemplateEditorManifest,
};
