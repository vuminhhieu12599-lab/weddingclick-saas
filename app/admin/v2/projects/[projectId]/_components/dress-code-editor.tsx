"use client";

import { useState } from "react";

import {
  createDressCodeSwatch,
  deleteDressCodeSwatch,
  fetchProjectDressCode,
  saveProjectDressCode,
  updateDressCodeSwatch,
} from "../../../../../../lib/admin/admin-api-client";
import {
  moveItem,
  nextSortOrder,
  parseDressCodeDescription,
  parseSwatchColor,
  reorderPlan,
} from "../../../../../../lib/admin/optional-content-editor";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { ProjectDressCodeWithSwatches } from "../../../../../../lib/server/project-dress-code/project-dress-code-gateway";
import type {
  ProjectDressCodeRecord,
  ProjectDressCodeSwatchRecord,
} from "../../../../../../lib/server/project-dress-code/project-dress-code-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import {
  actionError,
  type CardStatus,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SMALL_BUTTON_CLASS,
  StatusLine,
} from "./optional-content-shared";

/** Dress Code: only explicitly entered values are saved — no default text, no default colours. */
export function DressCodeEditorView({
  projectId,
  initial,
  onSaved,
}: {
  projectId: string;
  initial: ProjectDressCodeWithSwatches | null;
  onSaved: () => void;
}) {
  const [dressCode, setDressCode] = useState<ProjectDressCodeRecord | null>(initial?.dressCode ?? null);
  const [swatches, setSwatches] = useState<ProjectDressCodeSwatchRecord[]>(initial?.swatches ?? []);
  const [description, setDescription] = useState(initial?.dressCode.description ?? "");
  const [newColor, setNewColor] = useState("");
  // The native picker fires on every drag step; a swatch is written once, on blur.
  const [colorDrafts, setColorDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<CardStatus>({ kind: "IDLE" });
  const busy = status.kind === "SAVING";

  const ordered = [...swatches].sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pickerValue = parseSwatchColor(newColor);

  async function run(action: () => Promise<void>) {
    setStatus({ kind: "SAVING" });
    try {
      await action();
      setStatus({ kind: "SAVED" });
      onSaved();
    } catch (error) {
      setStatus({ kind: "ERROR", message: actionError(error) });
    }
  }

  function saveDescription() {
    const parsed = parseDressCodeDescription(description);
    if (!parsed.ok) return setStatus({ kind: "ERROR", message: parsed.error });
    void run(async () => {
      const saved = await saveProjectDressCode(projectId, parsed.value);
      setDressCode(saved);
      setDescription(saved.description ?? "");
    });
  }

  function addSwatch() {
    const parsed = parseSwatchColor(newColor);
    if (!parsed.ok) return setStatus({ kind: "ERROR", message: parsed.error });
    void run(async () => {
      const saved = await createDressCodeSwatch(projectId, { color: parsed.value, sortOrder: nextSortOrder(swatches) });
      setSwatches((current) => [...current, saved]);
      setNewColor("");
    });
  }

  function changeColor(swatch: ProjectDressCodeSwatchRecord, raw: string | undefined) {
    if (raw === undefined || raw === swatch.color) return;
    const parsed = parseSwatchColor(raw);
    if (!parsed.ok) return setStatus({ kind: "ERROR", message: parsed.error });
    void run(async () => {
      const saved = await updateDressCodeSwatch(projectId, swatch.id, { color: parsed.value });
      setSwatches((current) => current.map((row) => (row.id === saved.id ? saved : row)));
    });
  }

  function removeSwatch(swatch: ProjectDressCodeSwatchRecord) {
    void run(async () => {
      await deleteDressCodeSwatch(projectId, swatch.id);
      setSwatches((current) => current.filter((row) => row.id !== swatch.id));
    });
  }

  function move(index: number, delta: -1 | 1) {
    void run(async () => {
      for (const step of reorderPlan(moveItem(ordered, index, delta))) {
        const saved = await updateDressCodeSwatch(projectId, step.id, { sortOrder: step.sortOrder });
        setSwatches((current) => current.map((row) => (row.id === saved.id ? saved : row)));
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-medium text-slate-800">Dress Code</h4>
      {dressCode === null && <p className="mt-0.5 text-xs text-slate-400">Chưa có Dress Code.</p>}

      <label className="mt-3 block text-sm">
        <span className="font-medium text-slate-700">Mô tả (không bắt buộc)</span>
        <textarea rows={2} className={`${INPUT_CLASS} mt-1`} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <button type="button" className={`${PRIMARY_BUTTON_CLASS} mt-2`} disabled={busy} onClick={saveDescription}>
        {dressCode === null ? "Tạo Dress Code" : "Lưu mô tả"}
      </button>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="text-sm font-medium text-slate-700">Bảng màu</p>
        {dressCode === null ? (
          <p className="mt-1 text-xs text-slate-400">Tạo Dress Code trước khi thêm màu.</p>
        ) : (
          <>
            {ordered.length === 0 && <p className="mt-1 text-sm text-slate-400">Chưa có màu.</p>}
            <ol className="mt-2 space-y-1.5">
              {ordered.map((swatch, index) => (
                <li key={swatch.id} className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    aria-label={`Màu ${index + 1}`}
                    value={colorDrafts[swatch.id] ?? swatch.color}
                    disabled={busy}
                    onChange={(e) => {
                      const value = e.target.value;
                      setColorDrafts((current) => ({ ...current, [swatch.id]: value }));
                    }}
                    onBlur={() => changeColor(swatch, colorDrafts[swatch.id])}
                    className="h-8 w-10 cursor-pointer rounded border border-slate-300"
                  />
                  <code className="text-xs text-slate-600">{swatch.color}</code>
                  <span className="ml-auto flex gap-1">
                    <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label="Lên">↑</button>
                    <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy || index === ordered.length - 1} onClick={() => move(index, 1)} aria-label="Xuống">↓</button>
                    <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy} onClick={() => removeSwatch(swatch)}>Xoá</button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                aria-label="Mã màu mới"
                placeholder="#rrggbb"
                className={`${INPUT_CLASS} w-32`}
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
              />
              <input
                type="color"
                aria-label="Chọn màu mới"
                value={pickerValue.ok ? pickerValue.value : "#ffffff"}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-slate-300"
              />
              <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy} onClick={addSwatch}>Thêm màu</button>
            </div>
          </>
        )}
      </div>
      <StatusLine status={status} />
    </div>
  );
}

export function DressCodeEditor({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const { data, loading, error, reload } = useAdminQuery(() => fetchProjectDressCode(projectId), [projectId]);
  if (loading) return <LoadingState label="Đang tải Dress Code..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <DressCodeEditorView projectId={projectId} initial={data} onSaved={onSaved} />;
}
