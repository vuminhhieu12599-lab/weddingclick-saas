/**
 * Dress Code rows (migration 0030; docs/PHYSICAL_DATABASE_PLAN.md §2.9b;
 * docs/DECISIONS.md RF7 "Dress Code (Product Owner amendment)"): a Project's
 * optional Dress Code and its ordered colour swatches. Configurable project
 * data, never inferred from theme settings or CSS.
 */

/** One `project_dress_codes` row (at most one per Project). */
export interface ProjectDressCodeRecord {
  projectId: string;
  /** Plain text (no HTML), non-blank when present, at most 1000 characters. */
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One `project_dress_code_swatches` row. */
export interface ProjectDressCodeSwatchRecord {
  id: string;
  projectId: string;
  /** Canonical lowercase hex colour `#rrggbb` only. */
  color: string;
  /** Staff-authoritative order: sort_order ASC, then id ASC. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
