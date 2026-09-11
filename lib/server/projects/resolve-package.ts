import { SERVICE_PACKAGE_CODES, type ServicePackageCode } from "../../domain";
import { ApiError } from "../errors/api-error";
import type { ProjectGateway } from "./project-gateway";
import type { ServicePackageCatalogRow } from "./project-types";

function isCanonicalPackageCode(value: string): value is ServicePackageCode {
  return (SERVICE_PACKAGE_CODES as readonly string[]).includes(value);
}

/**
 * Resolves and validates a requested package code against the
 * service_packages catalog (Task 005 "PACKAGE VALIDATION").
 *
 * - Not a canonical ServicePackageCode at all -> 400 (malformed request).
 * - Canonical but no matching catalog row -> 404 (catalog reference not
 *   found).
 * - Catalog row exists but is_active = false -> 409 (business conflict —
 *   the package is real but not currently sellable).
 *
 * Never accepts a client-supplied price — the returned priceVnd always
 * comes from the live catalog row.
 */
export async function resolvePackageForCreation<TClient>(
  rawPackageCode: string,
  client: TClient,
  gateway: ProjectGateway<TClient>,
): Promise<ServicePackageCatalogRow> {
  if (!isCanonicalPackageCode(rawPackageCode)) {
    throw new ApiError(
      "BAD_REQUEST",
      `packageCode must be one of: ${SERVICE_PACKAGE_CODES.join(", ")}`,
    );
  }

  const catalogRow = await gateway.getPackageByCode(client, rawPackageCode);

  if (!catalogRow) {
    throw new ApiError("NOT_FOUND", `Package "${rawPackageCode}" was not found`);
  }

  if (!catalogRow.isActive) {
    throw new ApiError("CONFLICT", `Package "${rawPackageCode}" is not currently active`);
  }

  return catalogRow;
}
