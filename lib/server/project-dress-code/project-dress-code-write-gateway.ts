import type { ProjectDressCodeRecord, ProjectDressCodeSwatchRecord } from "./project-dress-code-types";

/** Validated values for one new swatch. */
export interface ProjectDressCodeSwatchInput {
  /** Canonical lowercase `#rrggbb`. */
  color: string;
  sortOrder: number;
}

/** Field-presence preserving patch: only the keys present are written. */
export type ProjectDressCodeSwatchPatch = Partial<ProjectDressCodeSwatchInput>;

/**
 * Staff write seam over `project_dress_codes` / `project_dress_code_swatches`
 * (migration 0030). Always called with a staff-scoped client, so the
 * `is_staff()` RLS policies are the real enforcement. Every write is one plain
 * RLS statement scoped by `project_id` (and `id`).
 */
export interface ProjectDressCodeWriteGateway<TClient> {
  projectExists(client: TClient, projectId: string): Promise<boolean>;
  /** Creates the Project's single Dress Code row or replaces its description. */
  upsertDressCode(client: TClient, projectId: string, description: string | null): Promise<ProjectDressCodeRecord>;
  /** `null` when the Project has no Dress Code row yet (0030 FK). */
  insertSwatch(
    client: TClient,
    projectId: string,
    input: ProjectDressCodeSwatchInput,
  ): Promise<ProjectDressCodeSwatchRecord | null>;
  /** `null` when no swatch with this id belongs to the Project. */
  updateSwatch(
    client: TClient,
    projectId: string,
    swatchId: string,
    patch: ProjectDressCodeSwatchPatch,
  ): Promise<ProjectDressCodeSwatchRecord | null>;
  /** `false` when no swatch with this id belongs to the Project. */
  deleteSwatch(client: TClient, projectId: string, swatchId: string): Promise<boolean>;
}
