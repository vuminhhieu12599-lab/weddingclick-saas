"use client";

import { useCallback, useState } from "react";

import { fetchCustomerById, fetchProjectDesign, fetchTemplateCatalog } from "../../../../../../lib/admin/admin-api-client";
import { findCatalogVersion } from "../../../../../../lib/admin/template-editor-presentation";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import { formatDateVi } from "../../../../../../lib/presentation/format-date";
import { formatVnd } from "../../../../../../lib/presentation/format-vnd";
import { getPaymentStatusLabel } from "../../../../../../lib/presentation/payment-status-labels";
import { getAddonLabel, getPackageLabel } from "../../../../../../lib/presentation/service-catalog-labels";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import { EditorReadinessPanel } from "./editor-readiness-panel";
import { OptionalInvitationContent } from "./optional-invitation-content";
import { RequiredInvitationData } from "./required-invitation-data";
import type { TabKey } from "./workspace-tabs";

/** TE-05A transitional template-first UX: template-specific content waits for a selected template. */
export function NoTemplateCard({ onChooseTemplate, title, message }: { onChooseTemplate?: () => void; title: string; message: string }) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5" data-no-template>
      <h3 className="text-sm font-semibold text-amber-900">{title}</h3>
      <p className="mt-1 text-sm text-amber-800">{message}</p>
      <a
        href="?tab=DESIGN"
        onClick={(event) => {
          if (!onChooseTemplate) return;
          event.preventDefault();
          onChooseTemplate();
        }}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto"
      >
        Chọn mẫu thiệp
      </a>
    </section>
  );
}

/**
 * The selected template's readiness and template-specific content. Canonical
 * required data stays editable before a template exists; everything here is
 * driven by the exact pinned version's server-provided editor manifest.
 */
function TemplateContent({ projectId, onNavigate }: { projectId: string; onNavigate?: (tab: TabKey) => void }) {
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((current) => current + 1), []);
  const { data, loading, error, reload } = useAdminQuery(async () => {
    const [catalog, design] = await Promise.all([fetchTemplateCatalog(), fetchProjectDesign(projectId)]);
    return { catalog, design };
  }, [projectId]);
  if (loading) return <LoadingState label="Đang tải mẫu thiệp..." />;
  if (error || !data) return <ErrorState message={error ?? "Không thể tải mẫu thiệp"} onRetry={reload} />;

  const chooseTemplate = onNavigate ? () => onNavigate("DESIGN") : undefined;
  if (data.design === null) {
    return (
      <NoTemplateCard
        onChooseTemplate={chooseTemplate}
        title="Chưa chọn mẫu thiệp"
        message="Chọn mẫu trước để WeddingClick hiển thị đúng các nội dung và ảnh mà mẫu này cần."
      />
    );
  }
  const selected = findCatalogVersion(data.catalog, data.design.templateVersionId);
  if (selected === null || selected.version.editorManifest === null) {
    return (
      <NoTemplateCard
        onChooseTemplate={chooseTemplate}
        title="Mẫu thiệp đang chọn chưa hỗ trợ trình soạn nội dung"
        message="Hãy chọn một mẫu thiệp khác để nhập nội dung và ảnh."
      />
    );
  }
  return (
    <>
      <EditorReadinessPanel projectId={projectId} templateName={selected.template.name} revision={revision} />
      <OptionalInvitationContent
        projectId={projectId}
        templateVersionId={selected.version.id}
        manifest={selected.version.editorManifest}
        onSaved={bump}
      />
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

export function DataTab({ project, onNavigate }: { project: ProjectSummary; onNavigate?: (tab: TabKey) => void }) {
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

      <RequiredInvitationData projectId={project.id} />

      <TemplateContent projectId={project.id} onNavigate={onNavigate} />
    </div>
  );
}
