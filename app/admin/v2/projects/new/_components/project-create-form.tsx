"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { createCustomer, createProject } from "../../../../../../lib/admin/admin-api-client";
import {
  CUSTOMER_NAME_MAX_LENGTH,
  submitProjectCreation,
  type CreatedCustomerRef,
  type ProjectCreationForm,
} from "../../../../../../lib/admin/project-creation";
import { SERVICE_ADDON_CODES, SERVICE_PACKAGE_CODES } from "../../../../../../lib/domain";
import { getAddonLabel, getPackageLabel } from "../../../../../../lib/presentation/service-catalog-labels";

const PACKAGE_HINTS: Readonly<Record<(typeof SERVICE_PACKAGE_CODES)[number], string>> = {
  COMMON: "Một thiệp chung cho cả hai bên gia đình.",
  SEPARATE: "Hai thiệp riêng: nhà trai (Lễ Thành Hôn) và nhà gái (Lễ Vu Quy).",
};

const ADDON_HINTS: Readonly<Record<(typeof SERVICE_ADDON_CODES)[number], string>> = {
  PERSONALIZED_GUEST: "Khách hàng tự tạo link thiệp có tên từng khách mời trong Cổng khách hàng.",
};

export const EMPTY_PROJECT_CREATION_FORM: ProjectCreationForm = {
  displayName: "",
  phone: "",
  email: "",
  contactNote: "",
  packageCode: "",
  addonCodes: [],
};

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

export interface ProjectCreateFormViewProps {
  form: ProjectCreationForm;
  createdCustomer: CreatedCustomerRef | null;
  submitting: boolean;
  error: string | null;
  onChange: (form: ProjectCreationForm) => void;
  onSubmit: () => void;
  onResetCustomer: () => void;
}

/** Presentational form; all writes happen in the container through the internal API. */
export function ProjectCreateFormView({
  form,
  createdCustomer,
  submitting,
  error,
  onChange,
  onSubmit,
  onResetCustomer,
}: ProjectCreateFormViewProps) {
  const customerLocked = createdCustomer !== null || submitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  function toggleAddon(code: string, checked: boolean) {
    onChange({
      ...form,
      addonCodes: checked ? [...form.addonCodes.filter((item) => item !== code), code] : form.addonCodes.filter((item) => item !== code),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="project-create-form" noValidate>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Khách hàng</h2>
        {createdCustomer !== null ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" data-testid="created-customer-notice">
            <p>
              Đã tạo khách hàng “{createdCustomer.displayName}”. Bấm “Thử lại tạo dự án” để chỉ tạo dự án cho khách hàng này — hệ thống sẽ không tạo thêm khách hàng.
            </p>
            <button
              type="button"
              onClick={onResetCustomer}
              disabled={submitting}
              className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              Nhập khách hàng khác
            </button>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700 sm:col-span-2">
              Tên khách hàng *
              <input
                type="text"
                value={form.displayName}
                maxLength={CUSTOMER_NAME_MAX_LENGTH}
                disabled={customerLocked}
                onChange={(event) => onChange({ ...form, displayName: event.target.value })}
                className={INPUT_CLASS}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm text-slate-700">
              Số điện thoại
              <input
                type="tel"
                value={form.phone}
                disabled={customerLocked}
                onChange={(event) => onChange({ ...form, phone: event.target.value })}
                className={INPUT_CLASS}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm text-slate-700">
              Email
              <input
                type="email"
                value={form.email}
                disabled={customerLocked}
                onChange={(event) => onChange({ ...form, email: event.target.value })}
                className={INPUT_CLASS}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm text-slate-700 sm:col-span-2">
              Ghi chú
              <textarea
                value={form.contactNote}
                disabled={customerLocked}
                rows={2}
                onChange={(event) => onChange({ ...form, contactNote: event.target.value })}
                className={INPUT_CLASS}
              />
            </label>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Gói dịch vụ *</h2>
        <div className="mt-3 space-y-2">
          {SERVICE_PACKAGE_CODES.map((code) => (
            <label key={code} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
              <input
                type="radio"
                name="packageCode"
                value={code}
                checked={form.packageCode === code}
                disabled={submitting}
                onChange={() => onChange({ ...form, packageCode: code })}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-slate-900">{getPackageLabel(code, code)}</span>
                <span className="block text-xs text-slate-500">{PACKAGE_HINTS[code]}</span>
              </span>
            </label>
          ))}
        </div>

        <h2 className="mt-5 text-sm font-semibold text-slate-900">Dịch vụ thêm</h2>
        <div className="mt-3 space-y-2">
          {SERVICE_ADDON_CODES.map((code) => (
            <label key={code} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
              <input
                type="checkbox"
                value={code}
                checked={form.addonCodes.includes(code)}
                disabled={submitting}
                onChange={(event) => toggleAddon(code, event.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-slate-900">{getAddonLabel(code, code)}</span>
                <span className="block text-xs text-slate-500">{ADDON_HINTS[code]}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Giá được hệ thống tính theo bảng giá hiện hành khi tạo dự án và hiển thị trong trang dự án. Dịch vụ thêm chỉ chọn được lúc tạo dự án.
        </p>
      </section>

      {error !== null && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Đang tạo..." : createdCustomer !== null ? "Thử lại tạo dự án" : "Tạo dự án"}
        </button>
      </div>
    </form>
  );
}

/**
 * Launch Hardening 03 / P0-3 container. A ref-based in-flight guard blocks a
 * second submit (double click, repeated Enter) before React re-renders the
 * disabled button. On success it replaces the route with the created
 * Project's workspace, using only the server-returned id.
 */
export function ProjectCreateForm() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [form, setForm] = useState<ProjectCreationForm>(EMPTY_PROJECT_CREATION_FORM);
  const [createdCustomer, setCreatedCustomer] = useState<CreatedCustomerRef | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    const outcome = await submitProjectCreation(form, createdCustomer, { createCustomer, createProject });
    if (outcome.kind === "CREATED") {
      router.replace(`/admin/v2/projects/${encodeURIComponent(outcome.projectId)}`);
      return;
    }
    if (outcome.kind === "PROJECT_FAILED") {
      setCreatedCustomer({ id: outcome.customerId, displayName: outcome.customerName });
    }
    setError(outcome.message);
    setSubmitting(false);
    inFlight.current = false;
  }

  return (
    <ProjectCreateFormView
      form={form}
      createdCustomer={createdCustomer}
      submitting={submitting}
      error={error}
      onChange={setForm}
      onSubmit={() => void submit()}
      onResetCustomer={() => {
        // Explicit choice to enter a different Customer: clear the old one's fields so a
        // resubmit cannot silently create a near-identical second Customer.
        setForm((current) => ({ ...current, displayName: "", phone: "", email: "", contactNote: "" }));
        setCreatedCustomer(null);
        setError(null);
      }}
    />
  );
}
