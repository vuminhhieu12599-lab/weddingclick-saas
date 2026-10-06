import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { validateCreateCustomerInput } from "../../server/customers/validate-customer-input";
import type { CustomerRecord } from "../../server/customers/customer-types";
import { validateCreateProjectRequest } from "../../server/projects/validate-create-project-request";
import type { CreateCustomerBody, CreateProjectBody } from "../admin-api-client";
import { AdminApiError } from "../admin-api-error";
import {
  creationErrorMessage,
  submitProjectCreation,
  type ProjectCreationApi,
  type ProjectCreationForm,
} from "../project-creation";

/** Launch Hardening 03 / P0-3 — Staff Customer + Project creation submission logic. */

vi.mock("../staff-session-client", () => ({ getStaffAccessToken: vi.fn(async () => "staff-jwt") }));
vi.mock("../signed-media-upload", () => ({ uploadToSignedMediaPath: vi.fn() }));

const client = await import("../admin-api-client");
const session = await import("../staff-session-client");

const ROOT = join(__dirname, "../../..");
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

const FORM: ProjectCreationForm = {
  displayName: "  Anh Hiếu và gia đình  ",
  phone: " 0900000000 ",
  email: "",
  contactNote: "   ",
  packageCode: "COMMON",
  addonCodes: [],
};

function customerRecord(displayName = "Anh Hiếu và gia đình"): CustomerRecord {
  return {
    id: CUSTOMER_ID,
    displayName,
    phone: null,
    email: null,
    contactNote: null,
    createdBy: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-10-06T03:00:00.000Z",
    updatedAt: "2026-10-06T03:00:00.000Z",
  };
}

function fakeApi(overrides: Partial<ProjectCreationApi> = {}) {
  const customerBodies: CreateCustomerBody[] = [];
  const projectBodies: CreateProjectBody[] = [];
  const api: ProjectCreationApi = {
    createCustomer: vi.fn(async (body: CreateCustomerBody) => {
      customerBodies.push(body);
      return customerRecord();
    }),
    createProject: vi.fn(async (body: CreateProjectBody) => {
      projectBodies.push(body);
      return { id: PROJECT_ID };
    }),
    ...overrides,
  };
  return { api, customerBodies, projectBodies };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("submitProjectCreation", () => {
  it("COMMON without add-on: one Customer (trimmed, blanks → null), then one Project; success carries only the server id", async () => {
    const { api, customerBodies, projectBodies } = fakeApi();
    const outcome = await submitProjectCreation(FORM, null, api);

    expect(outcome).toEqual({ kind: "CREATED", projectId: PROJECT_ID, customerId: CUSTOMER_ID });
    expect(customerBodies).toEqual([{ displayName: "Anh Hiếu và gia đình", phone: "0900000000", email: null, contactNote: null }]);
    expect(projectBodies).toEqual([{ customerId: CUSTOMER_ID, packageCode: "COMMON", addonCodes: [] }]);
  });

  it("SEPARATE + PERSONALIZED_GUEST: canonical codes only, duplicates collapsed", async () => {
    const { api, projectBodies } = fakeApi();
    await submitProjectCreation(
      { ...FORM, packageCode: "SEPARATE", addonCodes: ["PERSONALIZED_GUEST", "PERSONALIZED_GUEST"] },
      null,
      api,
    );
    expect(projectBodies).toEqual([{ customerId: CUSTOMER_ID, packageCode: "SEPARATE", addonCodes: ["PERSONALIZED_GUEST"] }]);
  });

  it("COMMON + PERSONALIZED_GUEST", async () => {
    const { api, projectBodies } = fakeApi();
    await submitProjectCreation({ ...FORM, addonCodes: ["PERSONALIZED_GUEST"] }, null, api);
    expect(projectBodies[0]).toEqual({ customerId: CUSTOMER_ID, packageCode: "COMMON", addonCodes: ["PERSONALIZED_GUEST"] });
  });

  it("Customer validation: blank or >200-character name is rejected before any API call", async () => {
    for (const displayName of ["", "    ", "a".repeat(201)]) {
      const { api } = fakeApi();
      const outcome = await submitProjectCreation({ ...FORM, displayName }, null, api);
      expect(outcome.kind).toBe("INVALID");
      expect(api.createCustomer).not.toHaveBeenCalled();
      expect(api.createProject).not.toHaveBeenCalled();
    }
    const { api } = fakeApi();
    expect((await submitProjectCreation({ ...FORM, displayName: "a".repeat(200) }, null, api)).kind).toBe("CREATED");
  });

  it("Project validation: missing/unknown package or unknown add-on is rejected before any API call", async () => {
    for (const patch of [{ packageCode: "" }, { packageCode: "PREMIUM" }, { addonCodes: ["QR_CODE"] }]) {
      const { api } = fakeApi();
      const outcome = await submitProjectCreation({ ...FORM, ...patch }, null, api);
      expect(outcome.kind).toBe("INVALID");
      expect(api.createCustomer).not.toHaveBeenCalled();
      expect(api.createProject).not.toHaveBeenCalled();
    }
  });

  it("Customer failure: no Project attempt, fixed safe message (raw server text never shown)", async () => {
    const { api } = fakeApi({
      createCustomer: vi.fn(async () => {
        throw new AdminApiError(500, "duplicate key value violates constraint customers_pkey");
      }),
    });
    const outcome = await submitProjectCreation(FORM, null, api);
    expect(outcome).toEqual({ kind: "CUSTOMER_FAILED", message: "Không thể tạo khách hàng lúc này. Vui lòng thử lại." });
    expect(api.createProject).not.toHaveBeenCalled();
  });

  it("Partial success: Customer created, Project failed → outcome keeps the created Customer id for retry", async () => {
    const { api } = fakeApi({
      createProject: vi.fn(async () => {
        throw new AdminApiError(409, "Package is not currently active");
      }),
    });
    const outcome = await submitProjectCreation(FORM, null, api);
    expect(outcome).toEqual({
      kind: "PROJECT_FAILED",
      message: "Gói dịch vụ hoặc dịch vụ thêm đã chọn hiện không còn hoạt động.",
      customerId: CUSTOMER_ID,
      customerName: "Anh Hiếu và gia đình",
    });
    expect(api.createCustomer).toHaveBeenCalledTimes(1);
  });

  it("Retry after partial success creates only the Project for the same Customer — never a second Customer", async () => {
    const existing = { id: CUSTOMER_ID, displayName: "Anh Hiếu và gia đình" };
    let attempts = 0;
    const { api, projectBodies } = fakeApi({
      createProject: vi.fn(async (body: CreateProjectBody) => {
        projectBodies.push(body);
        attempts += 1;
        if (attempts === 1) {
          throw new AdminApiError(0, "network");
        }
        return { id: PROJECT_ID };
      }),
    });

    // Customer fields may even have been cleared — the existing Customer is reused, not revalidated or recreated.
    const first = await submitProjectCreation({ ...FORM, displayName: "" }, existing, api);
    expect(first).toMatchObject({ kind: "PROJECT_FAILED", customerId: CUSTOMER_ID });
    const second = await submitProjectCreation({ ...FORM, displayName: "" }, existing, api);
    expect(second).toEqual({ kind: "CREATED", projectId: PROJECT_ID, customerId: CUSTOMER_ID });

    expect(api.createCustomer).not.toHaveBeenCalled();
    expect(projectBodies.map((body) => body.customerId)).toEqual([CUSTOMER_ID, CUSTOMER_ID]);
  });
});

describe("creationErrorMessage", () => {
  it("maps every status to a fixed Vietnamese message and never echoes server text", () => {
    const cases: [unknown, "CUSTOMER" | "PROJECT", string][] = [
      [new AdminApiError(0, "x"), "PROJECT", "Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại."],
      [new AdminApiError(401, "x"), "CUSTOMER", "Phiên đăng nhập nhân sự đã hết hạn. Vui lòng đăng nhập lại."],
      [new AdminApiError(403, "x"), "PROJECT", "Tài khoản không có quyền tạo khách hàng hoặc dự án."],
      [new AdminApiError(400, "x"), "CUSTOMER", "Thông tin khách hàng chưa hợp lệ. Vui lòng kiểm tra lại."],
      [new AdminApiError(400, "x"), "PROJECT", "Thông tin dự án chưa hợp lệ. Vui lòng kiểm tra gói dịch vụ và dịch vụ thêm."],
      [new AdminApiError(404, "x"), "PROJECT", "Không tìm thấy khách hàng hoặc gói dịch vụ đã chọn."],
      [new AdminApiError(429, "x"), "PROJECT", "Không thể tạo dự án lúc này. Vui lòng thử lại."],
      [new Error("boom"), "CUSTOMER", "Không thể tạo khách hàng lúc này. Vui lòng thử lại."],
    ];
    for (const [error, step, expected] of cases) {
      expect(creationErrorMessage(error, step)).toBe(expected);
    }
  });
});

describe("backend contract compatibility (Task 005 / 005B, unchanged)", () => {
  it("the UI bodies pass the existing server validators and carry business intent only — no price, status, payment, code or creator", async () => {
    const { api, customerBodies, projectBodies } = fakeApi();
    await submitProjectCreation({ ...FORM, packageCode: "SEPARATE", addonCodes: ["PERSONALIZED_GUEST"] }, null, api);

    expect(validateCreateCustomerInput(customerBodies[0])).toEqual(customerBodies[0]);
    expect(validateCreateProjectRequest(projectBodies[0])).toEqual({ ...projectBodies[0], assignedStaffId: null, deadlineAt: null });
    expect(Object.keys(customerBodies[0]).sort()).toEqual(["contactNote", "displayName", "email", "phone"]);
    expect(Object.keys(projectBodies[0]).sort()).toEqual(["addonCodes", "customerId", "packageCode"]);
  });

  it("price, status NEW and payment UNPAID stay server-derived inside create_project_with_addons (no auto-transition)", () => {
    const rpc = readFileSync(join(ROOT, "supabase/migrations/20260911041125_0006b_atomic_project_creation_rpc.sql"), "utf8");
    expect(rpc).toMatch(/SELECT id, code, name, price_vnd, is_active/);
    expect(rpc).toMatch(/status \('NEW'\),\s*\n\s*-- payment_status \('UNPAID'\)/);
    const sources = ["lib/admin/project-creation.ts", "app/admin/v2/projects/new/_components/project-create-form.tsx"].map((path) =>
      readFileSync(join(ROOT, path), "utf8"),
    );
    for (const source of sources) {
      expect(source).not.toMatch(/transitionProjectStatus|markProjectPaid|PriceVnd|paymentStatus|150[.,]?000|250[.,]?000|50[.,]?000/);
    }
  });
});

describe("admin-api-client createCustomer / createProject", () => {
  function stubFetch(body: unknown, status: number) {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    });
    return calls;
  }

  it("POST the existing internal routes with the staff Bearer token and return the server records", async () => {
    let calls = stubFetch(customerRecord(), 201);
    const body: CreateCustomerBody = { displayName: "A", phone: null, email: null, contactNote: null };
    expect(await client.createCustomer(body)).toEqual(customerRecord());
    expect(calls[0].url).toBe("/api/v2/internal/customers");
    expect(calls[0].init?.method).toBe("POST");
    expect(new Headers(calls[0].init?.headers).get("authorization")).toBe("Bearer staff-jwt");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(body);

    calls = stubFetch({ id: PROJECT_ID }, 201);
    expect(await client.createProject({ customerId: CUSTOMER_ID, packageCode: "COMMON", addonCodes: [] })).toEqual({ id: PROJECT_ID });
    expect(calls[0].url).toBe("/api/v2/internal/projects");
    expect(calls[0].init?.method).toBe("POST");
  });

  it("no staff session → 401 without any request; server errors surface as AdminApiError", async () => {
    const calls = stubFetch({ error: "Forbidden" }, 403);
    vi.mocked(session.getStaffAccessToken).mockResolvedValueOnce(null);
    await expect(client.createCustomer({ displayName: "A", phone: null, email: null, contactNote: null })).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(0);

    await expect(client.createProject({ customerId: CUSTOMER_ID, packageCode: "COMMON", addonCodes: [] })).rejects.toMatchObject({ status: 403 });
  });
});
