"use client";

import Link from "next/link";
import { useState } from "react";

import {
  fetchProjectDesign,
  fetchTemplateCatalog,
  saveProjectDesign,
} from "../../../../../../lib/admin/admin-api-client";
import {
  buildDesignAssignmentBody,
  findTemplateVersionOption,
  listTemplateVersionOptions,
} from "../../../../../../lib/admin/design-assignment";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { ProjectDesignRecord } from "../../../../../../lib/server/project-design/project-design-types";
import type { ProjectSummary } from "../../../../../../lib/server/projects/project-types";
import type { TemplateCatalogEntry } from "../../../../../../lib/server/templates/templates-types";
import { EmptyState, ErrorState, LoadingState } from "../../../_components/page-states";

export type SaveStatus =
  | { kind: "IDLE" }
  | { kind: "SAVING" }
  | { kind: "SAVED" }
  | { kind: "ERROR"; message: string };

export interface DesignAssignmentViewProps {
  projectId: string;
  project: Pick<ProjectSummary, "eventType">;
  catalog: readonly TemplateCatalogEntry[];
  design: ProjectDesignRecord | null;
  /** Exact staff-chosen `templateVersionId`; `""` until staff pick one (never pre-filled with latest/first). */
  selectedVersionId: string;
  onSelect: (templateVersionId: string) => void;
  onSave: () => void;
  saveStatus: SaveStatus;
}

export function versionLabel(template: TemplateCatalogEntry, versionNumber: number): string {
  return `${template.name} — phiên bản ${versionNumber}`;
}

/** Template assignment only: no palette/font/section editing, no publish. */
export function DesignAssignmentView({
  projectId,
  project,
  catalog,
  design,
  selectedVersionId,
  onSelect,
  onSave,
  saveStatus,
}: DesignAssignmentViewProps) {
  const currentTemplateVersionId = design?.templateVersionId ?? null;
  const current = currentTemplateVersionId ? findTemplateVersionOption(catalog, currentTemplateVersionId) : null;
  const options = listTemplateVersionOptions(catalog, project.eventType, currentTemplateVersionId);
  const selected = selectedVersionId ? findTemplateVersionOption(catalog, selectedVersionId) : null;
  const assignment = selected ? buildDesignAssignmentBody(selected.version, design) : null;
  const canSave = assignment?.ok === true && saveStatus.kind !== "SAVING";
  const previewHref = `/admin/v2/projects/${encodeURIComponent(projectId)}/preview`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">Thiết kế thiệp</h2>

      <div className="mt-3 text-sm">
        <span className="text-slate-500">Mẫu hiện tại: </span>
        <span className="font-medium text-slate-900" data-testid="current-design">
          {current
            ? versionLabel(current.template, current.version.versionNumber)
            : design
              ? "Phiên bản mẫu không có trong danh mục"
              : "Chưa chọn mẫu"}
        </span>
      </div>

      {options.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Chưa có mẫu thiệp khả dụng cho loại sự kiện này." />
        </div>
      ) : (
        <fieldset className="mt-4 space-y-2">
          <legend className="mb-2 text-sm font-medium text-slate-700">Chọn mẫu thiệp</legend>
          {options.map(({ template, version }) => (
            <label
              key={version.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm sm:py-2.5 ${
                selectedVersionId === version.id ? "border-slate-900 bg-slate-50" : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="templateVersionId"
                value={version.id}
                checked={selectedVersionId === version.id}
                onChange={() => onSelect(version.id)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="font-medium text-slate-900">{versionLabel(template, version.versionNumber)}</span>
                <span className="ml-2 break-all font-mono text-xs text-slate-400">{template.code}</span>
                {version.id === currentTemplateVersionId && (
                  <span className="ml-2 text-xs text-emerald-700">(đang dùng)</span>
                )}
                {!version.selectable && (
                  <span className="ml-2 text-xs text-amber-700">(không còn chọn mới)</span>
                )}
                {template.description && (
                  <span className="mt-0.5 block text-xs text-slate-500">{template.description}</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {assignment && !assignment.ok && <p className="mt-3 text-sm text-amber-700">{assignment.reason}</p>}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 sm:py-2"
        >
          {saveStatus.kind === "SAVING" ? "Đang lưu..." : "Lưu mẫu"}
        </button>

        {design && (
          <Link
            href={previewHref}
            className={`rounded-lg px-4 py-2.5 text-center text-sm font-medium sm:py-2 ${
              saveStatus.kind === "SAVED"
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            Xem trước thiệp
          </Link>
        )}
      </div>

      {saveStatus.kind === "SAVED" && (
        <p className="mt-3 text-sm text-emerald-700">Đã lưu mẫu thiệp. Bản nháp thiết kế đã cập nhật — chưa xuất bản.</p>
      )}
      {saveStatus.kind === "ERROR" && <p className="mt-3 text-sm text-red-600">{saveStatus.message}</p>}
    </div>
  );
}

export function DesignTab({ project }: { project: ProjectSummary }) {
  const { data, loading, error, reload } = useAdminQuery(
    async () => {
      const [catalog, design] = await Promise.all([fetchTemplateCatalog(), fetchProjectDesign(project.id)]);
      return { catalog, design };
    },
    [project.id],
  );
  const [savedDesign, setSavedDesign] = useState<ProjectDesignRecord | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "IDLE" });

  if (loading) {
    return <LoadingState label="Đang tải thiết kế..." />;
  }
  if (error || !data) {
    return <ErrorState message={error ?? "Không thể tải thiết kế"} onRetry={reload} />;
  }

  const catalog = data.catalog;
  const design = savedDesign ?? data.design;
  const selected = selectedVersionId ?? design?.templateVersionId ?? "";

  async function handleSave() {
    const option = selected ? findTemplateVersionOption(catalog, selected) : null;
    const assignment = option ? buildDesignAssignmentBody(option.version, design) : null;
    if (!assignment?.ok) {
      return;
    }
    setSaveStatus({ kind: "SAVING" });
    try {
      const saved = await saveProjectDesign(project.id, assignment.body);
      setSavedDesign(saved);
      setSaveStatus({ kind: "SAVED" });
    } catch (err) {
      setSaveStatus({
        kind: "ERROR",
        message: err instanceof Error ? `Không thể lưu mẫu: ${err.message}` : "Không thể lưu mẫu.",
      });
    }
  }

  return (
    <DesignAssignmentView
      projectId={project.id}
      project={project}
      catalog={catalog}
      design={design}
      selectedVersionId={selected}
      onSelect={(id) => {
        setSelectedVersionId(id);
        setSaveStatus({ kind: "IDLE" });
      }}
      onSave={() => void handleSave()}
      saveStatus={saveStatus}
    />
  );
}
