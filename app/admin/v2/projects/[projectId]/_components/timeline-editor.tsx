"use client";

import { useState } from "react";

import {
  createProjectTimelineItem,
  deleteProjectTimelineItem,
  fetchProjectTimeline,
  updateProjectTimelineItem,
} from "../../../../../../lib/admin/admin-api-client";
import {
  moveItem,
  nextSortOrder,
  parseTimelineForm,
  reorderPlan,
} from "../../../../../../lib/admin/optional-content-editor";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { ProjectTimelineItemRecord } from "../../../../../../lib/server/project-timeline/project-timeline-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import {
  actionError,
  type CardStatus,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SMALL_BUTTON_CLASS,
  StatusLine,
} from "./optional-content-shared";

type ItemForm = { time: string; label: string };

/** Timeline (Lịch trình): canonical rows only — never derived from ceremony events; no fixed count. */
export function TimelineEditorView({
  projectId,
  initialItems,
  onSaved,
}: {
  projectId: string;
  initialItems: readonly ProjectTimelineItemRecord[];
  onSaved: () => void;
}) {
  const [items, setItems] = useState<ProjectTimelineItemRecord[]>([...initialItems]);
  const [forms, setForms] = useState<Record<string, ItemForm>>(() =>
    Object.fromEntries(initialItems.map((item) => [item.id, { time: item.time, label: item.label }])),
  );
  const [draft, setDraft] = useState<ItemForm>({ time: "", label: "" });
  const [status, setStatus] = useState<CardStatus>({ kind: "IDLE" });
  const busy = status.kind === "SAVING";

  function applySaved(saved: ProjectTimelineItemRecord) {
    setItems((current) => [...current.filter((item) => item.id !== saved.id), saved]);
    setForms((current) => ({ ...current, [saved.id]: { time: saved.time, label: saved.label } }));
  }

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

  const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  function add() {
    const parsed = parseTimelineForm(draft);
    if (!parsed.ok) return setStatus({ kind: "ERROR", message: parsed.error });
    void run(async () => {
      applySaved(await createProjectTimelineItem(projectId, { ...parsed.value, sortOrder: nextSortOrder(items) }));
      setDraft({ time: "", label: "" });
    });
  }

  function save(item: ProjectTimelineItemRecord) {
    const parsed = parseTimelineForm(forms[item.id]);
    if (!parsed.ok) return setStatus({ kind: "ERROR", message: parsed.error });
    void run(async () => applySaved(await updateProjectTimelineItem(projectId, item.id, parsed.value)));
  }

  function remove(item: ProjectTimelineItemRecord) {
    if (!window.confirm("Xoá mục lịch trình này?")) return;
    void run(async () => {
      await deleteProjectTimelineItem(projectId, item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
    });
  }

  function move(index: number, delta: -1 | 1) {
    void run(async () => {
      for (const step of reorderPlan(moveItem(ordered, index, delta))) {
        const saved = await updateProjectTimelineItem(projectId, step.id, { sortOrder: step.sortOrder });
        setItems((current) => current.map((row) => (row.id === saved.id ? saved : row)));
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-medium text-slate-800">Lịch trình</h4>
      <p className="mt-0.5 text-xs text-slate-400">Thứ tự hiển thị theo danh sách, không tự sắp theo giờ.</p>

      {ordered.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Chưa có mục lịch trình.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {ordered.map((item, index) => {
            const form = forms[item.id] ?? { time: item.time, label: item.label };
            const update = (patch: Partial<ItemForm>) => setForms((current) => ({ ...current, [item.id]: { ...form, ...patch } }));
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-2">
                <input type="time" aria-label="Giờ" className={`${INPUT_CLASS} w-32`} value={form.time} onChange={(e) => update({ time: e.target.value })} />
                <input aria-label="Nội dung" className={`${INPUT_CLASS} min-w-40 flex-1`} value={form.label} onChange={(e) => update({ label: e.target.value })} />
                <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy} onClick={() => save(item)}>Lưu</button>
                <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label="Lên">↑</button>
                <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy || index === ordered.length - 1} onClick={() => move(index, 1)} aria-label="Xuống">↓</button>
                <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy} onClick={() => remove(item)}>Xoá</button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <input type="time" aria-label="Giờ mới" className={`${INPUT_CLASS} w-32`} value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
        <input
          aria-label="Nội dung mới"
          placeholder="Ví dụ: Đón khách"
          className={`${INPUT_CLASS} min-w-40 flex-1`}
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
        />
        <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={busy} onClick={add}>Thêm</button>
      </div>
      <StatusLine status={status} />
    </div>
  );
}

export function TimelineEditor({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const { data, loading, error, reload } = useAdminQuery(() => fetchProjectTimeline(projectId), [projectId]);
  if (loading) return <LoadingState label="Đang tải lịch trình..." />;
  if (error || !data) return <ErrorState message={error ?? "Không thể tải lịch trình"} onRetry={reload} />;
  return <TimelineEditorView projectId={projectId} initialItems={data} onSaved={onSaved} />;
}
