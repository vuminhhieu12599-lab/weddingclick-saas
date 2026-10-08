"use client";

import { fetchEditorReadiness } from "../../../../../../lib/admin/admin-api-client";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { EditorReadiness, EditorReadinessItemStatus } from "../../../../../../lib/server/template-editor/editor-readiness";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import { SMALL_BUTTON_CLASS } from "./optional-content-shared";

/** Neutral for NOT_USED: an optional item that is not used is never shown as a failure. */
const STATUS_STYLE: Readonly<Record<EditorReadinessItemStatus, { icon: string; className: string; label: string }>> = {
  COMPLETE: { icon: "✓", className: "text-emerald-700", label: "Hoàn tất" },
  WARNING: { icon: "!", className: "text-amber-700", label: "Nên bổ sung" },
  BLOCKING: { icon: "✕", className: "text-red-700", label: "Bắt buộc" },
  NOT_USED: { icon: "○", className: "text-slate-400", label: "Không sử dụng" },
};

export function EditorReadinessView({ readiness, templateName, onReload }: { readiness: EditorReadiness; templateName: string | null; onReload?: () => void }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" data-editor-readiness={readiness.overall}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold text-slate-700">
          Tiến độ nội dung{templateName ? ` — ${templateName}` : ""}
        </h3>
        {onReload && (
          <button type="button" className={`${SMALL_BUTTON_CLASS} min-h-11 sm:min-h-0`} onClick={onReload}>
            Tải lại
          </button>
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {readiness.items.map((entry) => {
          const style = STATUS_STYLE[entry.status];
          return (
            <li key={entry.key} className="flex items-start gap-2 text-sm" data-readiness-item={entry.key} data-readiness-status={entry.status}>
              <span className={`w-4 shrink-0 text-center font-semibold ${style.className}`} aria-label={style.label}>
                {style.icon}
              </span>
              <span className="min-w-0">
                <span className="text-slate-800">{entry.label}</span>
                <span className={`ml-1 ${entry.status === "NOT_USED" ? "text-slate-400" : "text-slate-500"}`}>— {entry.message}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">Việc cần làm tiếp theo: </span>
        <span className="font-medium text-slate-900" data-next-action>
          {readiness.nextAction}
        </span>
      </p>
    </section>
  );
}

export function EditorReadinessPanel({ projectId, templateName, revision }: { projectId: string; templateName: string | null; revision: number }) {
  const { data, loading, error, reload } = useAdminQuery(() => fetchEditorReadiness(projectId), [projectId, revision]);
  if (loading && !data) return <LoadingState label="Đang kiểm tra tiến độ nội dung..." />;
  if (error || !data) return <ErrorState message={error ?? "Không thể kiểm tra tiến độ nội dung"} onRetry={reload} />;
  return <EditorReadinessView readiness={data} templateName={templateName} onReload={reload} />;
}
