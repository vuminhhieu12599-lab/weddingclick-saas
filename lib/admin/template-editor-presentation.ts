import type { TemplateEditorContentKey, TemplateEditorManifestV1 } from "../../templates/core/editor-manifest";
import type { TemplateCatalogEntry, TemplateVersionCatalogEntry } from "../server/templates/templates-types";
import { MEDIA_EDITOR_ROLES, type MediaRoleConfig } from "./optional-content-editor";

/**
 * TE-05A — what the Staff Data tab shows for the selected template version,
 * derived only from its TemplateEditorManifestV1 (never from a template
 * name or slot key).
 */

/** The exact catalog version a design pins, with its template; `null` when it is not in the catalog. */
export function findCatalogVersion(
  catalog: readonly TemplateCatalogEntry[],
  templateVersionId: string,
): { template: TemplateCatalogEntry; version: TemplateVersionCatalogEntry } | null {
  for (const template of catalog) {
    const version = template.versions.find((candidate) => candidate.id === templateVersionId);
    if (version) return { template, version };
  }
  return null;
}

function hasContent(manifest: TemplateEditorManifestV1, key: TemplateEditorContentKey): boolean {
  return manifest.contentItems.some((item) => item.key === key);
}

/**
 * Media role cards for the legacy role editor.
 * - LEGACY_ROLES (Elegant Editorial v1): every legacy role, exactly as before.
 * - TEMPLATE_SLOTS: no invitation layout role; only semantic media — AUDIO
 *   when the template uses MUSIC, and the template-independent
 *   SOCIAL_SHARE_COVER. Gift QR stays with the Gift editor; QR_COMMON is
 *   never shown here.
 */
export function legacyMediaRolesFor(manifest: TemplateEditorManifestV1): readonly MediaRoleConfig[] {
  if (manifest.mediaModel === "LEGACY_ROLES") return MEDIA_EDITOR_ROLES;
  return MEDIA_EDITOR_ROLES.filter(
    (role) => role.mediaType === "SOCIAL_SHARE_COVER" || (role.mediaType === "AUDIO" && hasContent(manifest, "MUSIC")),
  );
}

export interface ContentEditorVisibility {
  readonly families: boolean;
  readonly timeline: boolean;
  readonly dressCode: boolean;
  readonly loveStory: boolean;
  readonly gift: boolean;
}

/** Optional content editors the selected template uses (COUPLE/EVENTS stay in the required-data flow). */
export function contentEditorsFor(manifest: TemplateEditorManifestV1): ContentEditorVisibility {
  return {
    families: hasContent(manifest, "FAMILIES"),
    timeline: hasContent(manifest, "TIMELINE"),
    dressCode: hasContent(manifest, "DRESS_CODE"),
    loveStory: hasContent(manifest, "LOVE_STORY"),
    gift: hasContent(manifest, "GIFT"),
  };
}
