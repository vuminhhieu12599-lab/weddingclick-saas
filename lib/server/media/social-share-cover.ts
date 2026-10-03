import type { StaffContext } from "../auth/staff-context";
import { listProjectMedia } from "./list-project-media";
import type { MediaGateway } from "./media-gateway";
import type { ProjectMediaRecord } from "./media-types";

/**
 * Social Share Cover accessor (Product Owner decision, 2026-10-03;
 * docs/DECISIONS.md "Social Share Cover"). The future publish / public
 * metadata layer resolves the published invitation's Open Graph image from
 * this media reference, signing a runtime URL then — nothing is signed or
 * stored at draft time.
 *
 * Strictly SOCIAL_SHARE_COVER: never COVER, a portrait, Photo Story or
 * Gallery. `null` means "not chosen"; no fallback policy is decided here.
 */

/** The effective SOCIAL_SHARE_COVER row: first by sort_order, then id (same rule as every single media role). */
export function selectEffectiveSocialShareCover(rows: readonly ProjectMediaRecord[]): ProjectMediaRecord | null {
  let effective: ProjectMediaRecord | null = null;
  for (const row of rows) {
    if (row.mediaType !== "SOCIAL_SHARE_COVER") continue;
    if (
      effective === null ||
      row.sortOrder < effective.sortOrder ||
      (row.sortOrder === effective.sortOrder && row.id < effective.id)
    ) {
      effective = row;
    }
  }
  return effective;
}

/** Staff-scoped (RLS) lookup through the existing list use case; the public layer will add its own read path later. */
export async function getEffectiveSocialShareCover<TClient>(
  rawProjectId: string,
  staff: StaffContext<TClient>,
  gateway: MediaGateway<TClient>,
): Promise<ProjectMediaRecord | null> {
  return selectEffectiveSocialShareCover(await listProjectMedia(rawProjectId, staff, gateway));
}
