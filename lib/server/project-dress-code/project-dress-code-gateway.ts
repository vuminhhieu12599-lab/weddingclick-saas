import type { ProjectDressCodeRecord, ProjectDressCodeSwatchRecord } from "./project-dress-code-types";

/** A Project's Dress Code row together with its ordered swatches. */
export interface ProjectDressCodeWithSwatches {
  dressCode: ProjectDressCodeRecord;
  /** Ordered sort_order ASC, then id ASC; may be empty. */
  swatches: ProjectDressCodeSwatchRecord[];
}

/**
 * Small seam (mirrors ProjectEventsGateway / MediaGateway) over the real
 * @supabase/supabase-js client. Always called with a staff-scoped client
 * (createStaffSupabaseClient), so the `is_staff()` RLS policies of migration
 * 0030 are the real enforcement — never an elevated credential.
 */
export interface ProjectDressCodeGateway<TClient> {
  /**
   * The Project's Dress Code, or `null` when it has none. A query failure or
   * malformed row throws (never `null`, never a default Dress Code).
   */
  getProjectDressCode(client: TClient, projectId: string): Promise<ProjectDressCodeWithSwatches | null>;
}
