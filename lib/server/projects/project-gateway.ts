import type {
  CreateProjectRpcParams,
  CreatedProjectRef,
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
 * `createProject` (Task 005B) calls the atomic `create_project_with_addons`
 * database RPC (supabase/migrations/20260911041125_0006b_atomic_project_creation_rpc.sql)
 * with business-intent fields only — never a client/server-computed price,
 * snapshot, id, or `createdBy` (the RPC derives `created_by` from
 * `auth.uid()` itself). See lib/server/projects/create-project.ts.
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
  createProject(client: TClient, params: CreateProjectRpcParams): Promise<CreatedProjectRef>;
}
