import type { SupabaseClient } from "@supabase/supabase-js";

import type { SnapshotTemplateVersionSource } from "../../invitation-rendering/snapshot-payload-types";
import type { TemplateVersionBindingGateway } from "../invitation-preview/template-version-binding-gateway";
import { isValidUuid } from "../validation/uuid";

function fail(): never {
  throw new Error("Unexpected result shape from the database");
}

/**
 * Production TemplateVersionBindingGateway: one DIRECT RLS SELECT of
 * `template_versions (id, renderer_key)` scoped by the exact id, with a
 * staff-scoped client. The row must be bound to the queried id and carry a
 * non-empty renderer key; the key is returned unchanged (no normalization).
 */
export const supabaseTemplateVersionBindingGateway: TemplateVersionBindingGateway<SupabaseClient> = {
  async getTemplateVersionBinding(client, templateVersionId): Promise<SnapshotTemplateVersionSource | null> {
    const { data, error } = await client
      .from("template_versions")
      .select("id, renderer_key")
      .eq("id", templateVersionId)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query template version");
    }

    if (data === null) {
      return null;
    }

    if (typeof data !== "object" || Array.isArray(data)) {
      fail();
    }

    const { id, renderer_key } = data as Record<string, unknown>;
    if (
      typeof id !== "string" ||
      !isValidUuid(id) ||
      id !== templateVersionId ||
      typeof renderer_key !== "string" ||
      renderer_key.length === 0
    ) {
      fail();
    }

    return { id, rendererKey: renderer_key };
  },
};
