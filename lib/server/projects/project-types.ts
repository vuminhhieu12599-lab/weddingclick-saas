import type {
  EventType,
  PaymentStatus,
  ProjectStatus,
  ServiceAddonCode,
  ServicePackageCode,
} from "../../domain";

/** Minimal customer summary embedded in a ProjectSummary (Task 005). */
export interface CustomerSummary {
  id: string;
  displayName: string;
}

/** Minimal staff summary embedded in a ProjectSummary (Task 005). */
export interface StaffSummary {
  id: string;
  displayName: string;
}

/** One active (non-revoked) project_addons row, as returned in a ProjectSummary. */
export interface ProjectAddonSummary {
  id: string;
  addonCodeSnapshot: string;
  addonNameSnapshot: string;
  priceVndSnapshot: number;
  createdAt: string;
}

/**
 * Project read-model for GET/list responses (Task 005 "Project reads should
 * include enough business summary for a later internal UI"). Field names
 * and presence exactly match migration 0005/0006 columns — no invented
 * fields.
 */
export interface ProjectSummary {
  id: string;
  projectCode: string;
  customer: CustomerSummary;
  eventType: EventType;
  status: ProjectStatus;
  deadlineAt: string | null;
  assignedStaff: StaffSummary | null;
  packageCodeSnapshot: string;
  packageNameSnapshot: string;
  basePriceVnd: number;
  addonTotalVnd: number;
  totalPriceVnd: number;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  addons: ProjectAddonSummary[];
}

export interface ListProjectsParams {
  limit: number;
  status: ProjectStatus | null;
  customerId: string | null;
  projectCode: string | null;
}

/** Current service_packages catalog row, as needed for creation validation. */
export interface ServicePackageCatalogRow {
  id: string;
  code: ServicePackageCode;
  name: string;
  priceVnd: number;
  isActive: boolean;
}

/** Current service_addons catalog row, as needed for creation validation. */
export interface ServiceAddonCatalogRow {
  id: string;
  code: ServiceAddonCode;
  name: string;
  priceVnd: number;
  isActive: boolean;
}

/** Active WeddingClick profile row, as needed for assigned-staff validation. */
export interface StaffProfileRow {
  id: string;
  displayName: string;
  isActive: boolean;
}

/**
 * Business-intent input to the `create_project_with_addons` atomic RPC
 * (Task 005B). Deliberately identical in shape to `CreateProjectRequest`
 * (validate-create-project-request.ts) — this is the only input the RPC
 * accepts; every commercial/id snapshot is re-resolved from the database
 * inside the RPC's own transaction, never supplied here.
 */
export interface CreateProjectRpcParams {
  customerId: string;
  packageCode: string;
  addonCodes: string[];
  assignedStaffId: string | null;
  deadlineAt: string | null;
}

/** Minimal, stable result of a successful Project creation (Task 005B). */
export interface CreatedProjectRef {
  id: string;
}
