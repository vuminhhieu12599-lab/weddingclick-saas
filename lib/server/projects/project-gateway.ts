import type {
  ListProjectsParams,
  ProjectSummary,
  ServiceAddonCatalogRow,
  ServicePackageCatalogRow,
  StaffProfileRow,
} from "./project-types";

/**
 * Small seam (Task 005, mirrors Task 004's StaffAuthGateway pattern) that
 * decouples Project use cases/validation from the real @supabase/supabase-js
 * client shape.
 *
 * Deliberately has no `createProject`/`createProjectWithAddons` method — see
 * the Task 005 final report's TRANSACTION ATOMICITY REVIEW. Project creation
 * (write path) is not implemented in this task; this gateway only covers the
 * reads and catalog/staff lookups needed for GET/list and for the
 * creation-validation logic that is implemented and unit-tested now so a
 * future atomic creation RPC can be wired against it directly.
 */
export interface ProjectGateway<TClient> {
  getProjectById(client: TClient, id: string): Promise<ProjectSummary | null>;
  listProjects(client: TClient, params: ListProjectsParams): Promise<ProjectSummary[]>;
  getPackageByCode(
    client: TClient,
    code: string,
  ): Promise<ServicePackageCatalogRow | null>;
  getAddonsByCodes(client: TClient, codes: string[]): Promise<ServiceAddonCatalogRow[]>;
  getActiveStaffProfileById(client: TClient, id: string): Promise<StaffProfileRow | null>;
}
