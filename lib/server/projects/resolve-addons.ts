import { SERVICE_ADDON_CODES, type ServiceAddonCode } from "../../domain";
import { ApiError } from "../errors/api-error";
import type { ProjectGateway } from "./project-gateway";
import type { ServiceAddonCatalogRow } from "./project-types";

function isCanonicalAddonCode(value: string): value is ServiceAddonCode {
  return (SERVICE_ADDON_CODES as readonly string[]).includes(value);
}

/**
 * Resolves and validates requested add-on codes against the service_addons
 * catalog (Task 005 "PACKAGE VALIDATION" / add-ons section).
 *
 * Duplicate-handling choice: **reject duplicates** with a clean 400
 * validation error, rather than silently deduplicating. A duplicate
 * addonCode in the request is far more likely to be a client bug (e.g. an
 * accidental double-submit merging two form fields) than a deliberate
 * "add it twice" — silently deduping could mask that bug, and the schema's
 * one-active-row-per-(project,addon) unique index means "twice" was never a
 * meaningful request in the first place. See docs/PHYSICAL_DATABASE_PLAN.md
 * §2.6.
 *
 * - Empty input -> returns [] (no add-ons is a fully valid request).
 * - Duplicate code in input -> 400.
 * - Not a canonical ServiceAddonCode -> 400.
 * - Canonical but no matching catalog row -> 404.
 * - Catalog row exists but is_active = false -> 409.
 *
 * Never accepts a client-supplied price — every returned priceVnd comes
 * from the live catalog.
 */
export async function resolveAddonsForCreation<TClient>(
  rawAddonCodes: string[],
  client: TClient,
  gateway: ProjectGateway<TClient>,
): Promise<ServiceAddonCatalogRow[]> {
  if (rawAddonCodes.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  for (const code of rawAddonCodes) {
    if (seen.has(code)) {
      throw new ApiError("BAD_REQUEST", `Duplicate addon code in request: "${code}"`);
    }
    seen.add(code);
  }

  for (const code of rawAddonCodes) {
    if (!isCanonicalAddonCode(code)) {
      throw new ApiError(
        "BAD_REQUEST",
        `addonCodes must only contain: ${SERVICE_ADDON_CODES.join(", ")}`,
      );
    }
  }

  const catalogRows = await gateway.getAddonsByCodes(client, rawAddonCodes);
  const catalogByCode = new Map(catalogRows.map((row) => [row.code, row]));

  const resolved: ServiceAddonCatalogRow[] = [];
  for (const code of rawAddonCodes) {
    const catalogRow = catalogByCode.get(code as ServiceAddonCode);

    if (!catalogRow) {
      throw new ApiError("NOT_FOUND", `Add-on "${code}" was not found`);
    }

    if (!catalogRow.isActive) {
      throw new ApiError("CONFLICT", `Add-on "${code}" is not currently active`);
    }

    resolved.push(catalogRow);
  }

  return resolved;
}
