"use client";

import { fetchCustomerById } from "../../../../../../lib/admin/admin-api-client";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import { formatDateVi } from "../../../../../../lib/presentation/format-date";
import { formatVnd } from "../../../../../../lib/presentation/format-vnd";
import { getPaymentStatusLabel } from "../../../../../../lib/presentation/payment-status-labels";
import { getAddonLabel, getPackageLabel } from "../../../../../../lib/presentation/service-catalog-labels";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { EmptyState, ErrorState, LoadingState } from "../../../_components/page-states";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

export function DataTab({ project }: { project: ProjectSummary }) {
  const {
    data: customer,
    loading,
    error,
    reload,
  } = useAdminQuery(() => fetchCustomerById(project.customer.id), [project.customer.id]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Thông tin thương mại</h3>
        <div className="divide-y divide-slate-100">
          <SummaryRow
            label="Gói dịch vụ"
            value={getPackageLabel(project.packageCodeSnapshot, project.packageNameSnapshot)}
          />
          <SummaryRow label="Giá gói (chưa gồm dịch vụ thêm)" value={formatVnd(project.basePriceVnd)} />
          <SummaryRow label="Tổng giá dịch vụ thêm" value={formatVnd(project.addonTotalVnd)} />
          <SummaryRow label="Tổng giá trị dự án" value={formatVnd(project.totalPriceVnd)} />
          <SummaryRow label="Thanh toán" value={getPaymentStatusLabel(project.paymentStatus)} />
        </div>

        {project.addons.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Dịch vụ thêm
            </p>
            <ul className="space-y-1.5">
              {project.addons.map((addon) => (
                <li key={addon.id} className="flex justify-between text-sm">
                  <span className="text-slate-600">
                    {getAddonLabel(addon.addonCodeSnapshot, addon.addonNameSnapshot)}
                  </span>
                  <span className="font-medium text-slate-800">
                    {formatVnd(addon.priceVndSnapshot)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Thông tin khách hàng</h3>

        {loading && <LoadingState label="Đang tải thông tin khách hàng..." />}
        {!loading && error && <ErrorState message={error} onRetry={reload} />}
        {!loading && !error && customer && (
          <div className="divide-y divide-slate-100">
            <SummaryRow label="Tên khách hàng" value={customer.displayName} />
            <SummaryRow label="Số điện thoại" value={customer.phone ?? "Chưa có"} />
            <SummaryRow label="Email" value={customer.email ?? "Chưa có"} />
            <SummaryRow label="Ghi chú" value={customer.contactNote ?? "Không có"} />
            <SummaryRow label="Khách hàng từ" value={formatDateVi(customer.createdAt)} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Thông tin cưới</h3>
        <EmptyState
          title="Thông tin cưới sẽ hiển thị ở đây"
          description="Chức năng đọc Wedding Details chưa được triển khai trong checkpoint UI-001."
        />
      </section>
    </div>
  );
}
