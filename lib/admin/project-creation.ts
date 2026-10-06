import {
  SERVICE_ADDON_CODES,
  SERVICE_PACKAGE_CODES,
  type ServiceAddonCode,
  type ServicePackageCode,
} from "../domain";
import type { CustomerRecord } from "../server/customers/customer-types";
import type { CreateCustomerBody, CreateProjectBody } from "./admin-api-client";
import { AdminApiError } from "./admin-api-error";

/**
 * Launch Hardening 03 / P0-3 — Staff "Tạo dự án" submission logic, kept pure
 * so retry and partial-success behavior is testable without a browser.
 *
 * Two existing staff routes, in order: POST /customers (Task 005), then
 * POST /projects (Task 005B, atomic `create_project_with_addons`). They are
 * NOT one transaction. If the Customer is created and the Project fails, the
 * Customer legitimately remains; its id is returned so a retry creates only
 * the Project and never a second Customer. Neither route is idempotent, so
 * the page must also block concurrent submits.
 */

/** Mirrors the server rule (lib/server/customers/validate-customer-input.ts) for UX only. */
export const CUSTOMER_NAME_MAX_LENGTH = 200;

export interface ProjectCreationForm {
  displayName: string;
  phone: string;
  email: string;
  contactNote: string;
  packageCode: string;
  addonCodes: string[];
}

export interface ProjectCreationApi {
  createCustomer: (input: CreateCustomerBody) => Promise<CustomerRecord>;
  createProject: (input: CreateProjectBody) => Promise<{ id: string }>;
}

export type ProjectCreationOutcome =
  | { kind: "INVALID"; message: string }
  | { kind: "CUSTOMER_FAILED"; message: string }
  | { kind: "PROJECT_FAILED"; message: string; customerId: string; customerName: string }
  | { kind: "CREATED"; projectId: string; customerId: string };

/** An already-created Customer this form owns (from an earlier attempt). */
export interface CreatedCustomerRef {
  id: string;
  displayName: string;
}

function isPackageCode(value: string): value is ServicePackageCode {
  return (SERVICE_PACKAGE_CODES as readonly string[]).includes(value);
}

function isAddonCode(value: string): value is ServiceAddonCode {
  return (SERVICE_ADDON_CODES as readonly string[]).includes(value);
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Fixed Vietnamese messages keyed by HTTP status; server text is never shown raw. */
export function creationErrorMessage(error: unknown, step: "CUSTOMER" | "PROJECT"): string {
  if (error instanceof AdminApiError) {
    switch (error.status) {
      case 0:
        return "Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.";
      case 401:
        return "Phiên đăng nhập nhân sự đã hết hạn. Vui lòng đăng nhập lại.";
      case 403:
        return "Tài khoản không có quyền tạo khách hàng hoặc dự án.";
      case 400:
        return step === "CUSTOMER"
          ? "Thông tin khách hàng chưa hợp lệ. Vui lòng kiểm tra lại."
          : "Thông tin dự án chưa hợp lệ. Vui lòng kiểm tra gói dịch vụ và dịch vụ thêm.";
      case 404:
        return "Không tìm thấy khách hàng hoặc gói dịch vụ đã chọn.";
      case 409:
        return "Gói dịch vụ hoặc dịch vụ thêm đã chọn hiện không còn hoạt động.";
    }
  }
  return step === "CUSTOMER"
    ? "Không thể tạo khách hàng lúc này. Vui lòng thử lại."
    : "Không thể tạo dự án lúc này. Vui lòng thử lại.";
}

/**
 * Validates for UX (the server re-validates everything), creates the Customer
 * unless `existingCustomer` is given, then creates the Project. Success is
 * reported only with the server-returned Project id.
 */
export async function submitProjectCreation(
  form: ProjectCreationForm,
  existingCustomer: CreatedCustomerRef | null,
  api: ProjectCreationApi,
): Promise<ProjectCreationOutcome> {
  const displayName = form.displayName.trim();
  if (existingCustomer === null && (displayName.length < 1 || displayName.length > CUSTOMER_NAME_MAX_LENGTH)) {
    return { kind: "INVALID", message: `Vui lòng nhập tên khách hàng (tối đa ${CUSTOMER_NAME_MAX_LENGTH} ký tự).` };
  }
  if (!isPackageCode(form.packageCode)) {
    return { kind: "INVALID", message: "Vui lòng chọn gói dịch vụ." };
  }
  const addonCodes = [...new Set(form.addonCodes)];
  if (!addonCodes.every(isAddonCode)) {
    return { kind: "INVALID", message: "Dịch vụ thêm không hợp lệ." };
  }

  let customer = existingCustomer;
  if (customer === null) {
    try {
      const created = await api.createCustomer({
        displayName,
        phone: optional(form.phone),
        email: optional(form.email),
        contactNote: optional(form.contactNote),
      });
      customer = { id: created.id, displayName: created.displayName };
    } catch (error) {
      return { kind: "CUSTOMER_FAILED", message: creationErrorMessage(error, "CUSTOMER") };
    }
  }

  try {
    const project = await api.createProject({
      customerId: customer.id,
      packageCode: form.packageCode,
      addonCodes: addonCodes.filter(isAddonCode),
    });
    return { kind: "CREATED", projectId: project.id, customerId: customer.id };
  } catch (error) {
    return {
      kind: "PROJECT_FAILED",
      message: creationErrorMessage(error, "PROJECT"),
      customerId: customer.id,
      customerName: customer.displayName,
    };
  }
}
