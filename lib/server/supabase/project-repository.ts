import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventType, PaymentStatus, ProjectStatus } from "../../domain";
import { ApiError } from "../errors/api-error";
import { CREATE_PROJECT_RPC_ERROR_CODES } from "../projects/create-project-error-codes";
import type { ProjectGateway } from "../projects/project-gateway";
import type {
  CreatedProjectRef,
  CreateProjectRpcParams,
  ListProjectsParams,
  ProjectAddonSummary,
  ProjectSummary,
  ServiceAddonCatalogRow,
  ServicePackageCatalogRow,
  StaffProfileRow,
} from "../projects/project-types";

/**
 * Production ProjectGateway (Task 005): the only place in the Project
 * feature that issues real @supabase/supabase-js calls. Always invoked with
 * a staff-scoped client (Task 004's createStaffSupabaseClient), so
 * `projects`/`project_addons`/`customers`/`profiles`/`service_packages`/
 * `service_addons` RLS remains the real enforcement — this module never
 * uses service_role.
 *
 * Deliberately does not embed related-table joins in a single PostgREST
 * `select` (e.g. `select=*, customers(...), profiles(...)`) — that requires
 * hard-coding this project's exact auto-generated FK constraint names
 * (`projects_customer_id_fkey`, etc., which Postgres derived rather than
 * this plan naming explicitly) as embed hints, which is fragile to depend
 * on. Separate, explicit batched queries are simpler to read and verify
 * against docs/PHYSICAL_DATABASE_PLAN.md, at the cost of a few more
 * round-trips — acceptable at V1's "reasonable limit" list sizes.
 */
interface ProjectRow {
  id: string;
  project_code: string;
  customer_id: string;
  event_type: string;
  status: string;
  deadline_at: string | null;
  assigned_staff_id: string | null;
  package_code_snapshot: string;
  package_name_snapshot: string;
  base_price_vnd: number;
  addon_total_vnd: number;
  total_price_vnd: number;
  payment_status: string;
  created_at: string;
  updated_at: string;
}

interface CustomerNameRow {
  id: string;
  display_name: string;
}

interface ProfileNameRow {
  id: string;
  display_name: string;
}

interface ProjectAddonRow {
  id: string;
  project_id: string;
  addon_code_snapshot: string;
  addon_name_snapshot: string;
  price_vnd_snapshot: number;
  created_at: string;
}

interface ServicePackageRow {
  id: string;
  code: string;
  name: string;
  price_vnd: number;
  is_active: boolean;
}

interface ServiceAddonRow {
  id: string;
  code: string;
  name: string;
  price_vnd: number;
  is_active: boolean;
}

interface ActiveProfileRow {
  id: string;
  display_name: string;
  is_active: boolean;
}

const PROJECT_COLUMNS =
  "id, project_code, customer_id, event_type, status, deadline_at, assigned_staff_id, " +
  "package_code_snapshot, package_name_snapshot, base_price_vnd, addon_total_vnd, " +
  "total_price_vnd, payment_status, created_at, updated_at";

async function fetchCustomerNamesByIds(
  client: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from("customers")
    .select("id, display_name")
    .in("id", ids);

  if (error) {
    throw new Error("Failed to load customer summaries");
  }

  return new Map((data as CustomerNameRow[]).map((row) => [row.id, row.display_name]));
}

async function fetchProfileNamesByIds(
  client: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await client
    .from("profiles")
    .select("id, display_name")
    .in("id", ids);

  if (error) {
    throw new Error("Failed to load staff summaries");
  }

  return new Map((data as ProfileNameRow[]).map((row) => [row.id, row.display_name]));
}

async function fetchActiveAddonsByProjectIds(
  client: SupabaseClient,
  projectIds: string[],
): Promise<Map<string, ProjectAddonSummary[]>> {
  const byProject = new Map<string, ProjectAddonSummary[]>();

  if (projectIds.length === 0) {
    return byProject;
  }

  const { data, error } = await client
    .from("project_addons")
    .select("id, project_id, addon_code_snapshot, addon_name_snapshot, price_vnd_snapshot, created_at")
    .in("project_id", projectIds)
    .is("revoked_at", null);

  if (error) {
    throw new Error("Failed to load project add-ons");
  }

  for (const row of data as ProjectAddonRow[]) {
    const summary: ProjectAddonSummary = {
      id: row.id,
      addonCodeSnapshot: row.addon_code_snapshot,
      addonNameSnapshot: row.addon_name_snapshot,
      priceVndSnapshot: row.price_vnd_snapshot,
      createdAt: row.created_at,
    };

    const existing = byProject.get(row.project_id);
    if (existing) {
      existing.push(summary);
    } else {
      byProject.set(row.project_id, [summary]);
    }
  }

  return byProject;
}

function toProjectSummary(
  row: ProjectRow,
  customerNamesById: Map<string, string>,
  staffNamesById: Map<string, string>,
  addonsByProjectId: Map<string, ProjectAddonSummary[]>,
): ProjectSummary {
  const customerDisplayName = customerNamesById.get(row.customer_id);
  const assignedStaffDisplayName = row.assigned_staff_id
    ? staffNamesById.get(row.assigned_staff_id)
    : undefined;

  return {
    id: row.id,
    projectCode: row.project_code,
    customer: {
      id: row.customer_id,
      // Falls back to the id if the referenced customer row could not be
      // loaded (should not happen given customer_id is RESTRICT — defensive
      // only, never throws mid-list for one bad row).
      displayName: customerDisplayName ?? row.customer_id,
    },
    eventType: row.event_type as EventType,
    status: row.status as ProjectStatus,
    deadlineAt: row.deadline_at,
    assignedStaff: row.assigned_staff_id
      ? { id: row.assigned_staff_id, displayName: assignedStaffDisplayName ?? row.assigned_staff_id }
      : null,
    packageCodeSnapshot: row.package_code_snapshot,
    packageNameSnapshot: row.package_name_snapshot,
    basePriceVnd: row.base_price_vnd,
    addonTotalVnd: row.addon_total_vnd,
    totalPriceVnd: row.total_price_vnd,
    paymentStatus: row.payment_status as PaymentStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    addons: addonsByProjectId.get(row.id) ?? [],
  };
}

async function hydrateProjectRows(
  client: SupabaseClient,
  rows: ProjectRow[],
): Promise<ProjectSummary[]> {
  const customerIds = [...new Set(rows.map((row) => row.customer_id))];
  const staffIds = [
    ...new Set(
      rows
        .map((row) => row.assigned_staff_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const projectIds = rows.map((row) => row.id);

  const [customerNamesById, staffNamesById, addonsByProjectId] = await Promise.all([
    fetchCustomerNamesByIds(client, customerIds),
    fetchProfileNamesByIds(client, staffIds),
    fetchActiveAddonsByProjectIds(client, projectIds),
  ]);

  return rows.map((row) =>
    toProjectSummary(row, customerNamesById, staffNamesById, addonsByProjectId),
  );
}

export const supabaseProjectGateway: ProjectGateway<SupabaseClient> = {
  async getProjectById(client, id: string) {
    const { data, error } = await client
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query project");
    }

    if (!data) {
      return null;
    }

    const [summary] = await hydrateProjectRows(client, [data as unknown as ProjectRow]);
    return summary;
  },

  async listProjects(client, params: ListProjectsParams) {
    let query = client
      .from("projects")
      .select(PROJECT_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(params.limit);

    if (params.status) {
      query = query.eq("status", params.status);
    }
    if (params.customerId) {
      query = query.eq("customer_id", params.customerId);
    }
    if (params.projectCode) {
      query = query.eq("project_code", params.projectCode);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error("Failed to list projects");
    }

    return hydrateProjectRows(client, (data ?? []) as unknown as ProjectRow[]);
  },

  async getPackageByCode(client, code: string): Promise<ServicePackageCatalogRow | null> {
    const { data, error } = await client
      .from("service_packages")
      .select("id, code, name, price_vnd, is_active")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query service package catalog");
    }

    if (!data) {
      return null;
    }

    const row = data as ServicePackageRow;
    return {
      id: row.id,
      code: row.code as ServicePackageCatalogRow["code"],
      name: row.name,
      priceVnd: row.price_vnd,
      isActive: row.is_active,
    };
  },

  async getAddonsByCodes(client, codes: string[]): Promise<ServiceAddonCatalogRow[]> {
    if (codes.length === 0) {
      return [];
    }

    const { data, error } = await client
      .from("service_addons")
      .select("id, code, name, price_vnd, is_active")
      .in("code", codes);

    if (error) {
      throw new Error("Failed to query service addon catalog");
    }

    return (data as ServiceAddonRow[]).map((row) => ({
      id: row.id,
      code: row.code as ServiceAddonCatalogRow["code"],
      name: row.name,
      priceVnd: row.price_vnd,
      isActive: row.is_active,
    }));
  },

  async getActiveStaffProfileById(client, id: string): Promise<StaffProfileRow | null> {
    const { data, error } = await client
      .from("profiles")
      .select("id, display_name, is_active")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw new Error("Failed to query staff profile");
    }

    if (!data) {
      return null;
    }

    const row = data as ActiveProfileRow;
    return { id: row.id, displayName: row.display_name, isActive: row.is_active };
  },

  /**
   * Calls the atomic `create_project_with_addons` RPC (Task 005B) with
   * business-intent parameters only. This is the only method in this
   * gateway that mutates projects/project_addons, and the only place that
   * translates the RPC's stable WCxxx error-code contract
   * (create-project-error-codes.ts) into an ApiError. Any RPC error whose
   * code is not in that map is an unexpected database failure — it is
   * deliberately rethrown as a generic Error (never forwarding the raw
   * Postgres message) so the route layer maps it to a generic HTTP 500.
   */
  async createProject(
    client,
    params: CreateProjectRpcParams,
  ): Promise<CreatedProjectRef> {
    const { data, error } = await client.rpc("create_project_with_addons", {
      p_customer_id: params.customerId,
      p_package_code: params.packageCode,
      p_addon_codes: params.addonCodes,
      p_assigned_staff_id: params.assignedStaffId,
      p_deadline_at: params.deadlineAt,
    });

    if (error) {
      const known = CREATE_PROJECT_RPC_ERROR_CODES[error.code];
      if (known) {
        throw new ApiError(known.kind, known.message);
      }
      throw new Error("Failed to create project");
    }

    if (typeof data !== "string") {
      throw new Error("Failed to create project");
    }

    return { id: data };
  },
};
