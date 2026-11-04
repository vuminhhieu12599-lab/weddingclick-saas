"use client";

import { useId, useState } from "react";

import { fetchProjectDesign, saveProjectDesign } from "../../../../../../lib/admin/admin-api-client";
import { adminQueries } from "../../../../../../lib/admin/admin-queries";
import {
  buildScriptureDesignBody,
  SCRIPTURE_DEFAULT_REFERENCE,
  SCRIPTURE_DEFAULT_VERSE,
  SCRIPTURE_REFERENCE_MAX_LENGTH,
  SCRIPTURE_VERSE_MAX_LENGTH,
  scriptureDefaultForm,
  scriptureFormFrom,
  type ScriptureForm,
} from "../../../../../../lib/admin/scripture-settings-editor";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { ProjectDesignRecord } from "../../../../../../lib/server/project-design/project-design-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import { actionError, type CardStatus, INPUT_CLASS, PRIMARY_BUTTON_CLASS, SMALL_BUTTON_CLASS, StatusLine } from "./optional-content-shared";

/**
 * HA-CONTENT-01 — "Cấu hình Lời Chúa".
 *
 * The configurable Scripture quote of the selected template version, stored
 * as that version's two optional `project_design.design_settings` keys. It
 * is shown only for a version whose design manifest declares them (today
 * exactly `wedding.hong-an.v2`); `OptionalInvitationContent` decides that
 * from the manifest, never from a renderer key.
 *
 * DRAFT ONLY. This writes the mutable `project_design` row and never
 * publishes. An existing Review snapshot and a published invitation carry
 * their own frozen copy of these settings, so neither changes here; the next
 * Review created from the draft picks the saved value up (CLAUDE.md §8).
 *
 * BLANK RESTORES THE DEFAULT. An empty field removes the override entirely
 * rather than storing an empty string, so the template's own approved verse
 * comes back. The fields therefore start empty when nothing is configured —
 * the default is shown as placeholder and help text, never prefilled, which
 * would quietly turn the default into a stored override on the next save.
 */
export function ScriptureEditorView({
  projectId,
  templateVersionId,
  initialDesign,
  onSaved,
}: {
  projectId: string;
  templateVersionId: string;
  initialDesign: ProjectDesignRecord | null;
  onSaved: () => void;
}) {
  const verseId = useId();
  const referenceId = useId();
  const [form, setForm] = useState<ScriptureForm>(() => scriptureFormFrom(initialDesign));
  const [status, setStatus] = useState<CardStatus>({ kind: "IDLE" });
  const busy = status.kind === "SAVING";

  /**
   * Re-reads the latest design row and rebuilds the whole body from it, so a
   * palette, section setting or other design setting changed elsewhere is
   * carried over rather than reverted, and a template reassigned meanwhile
   * is detected instead of overwritten.
   */
  async function save(next: ScriptureForm) {
    setStatus({ kind: "SAVING" });
    try {
      const latest = await fetchProjectDesign(projectId);
      const built = buildScriptureDesignBody(latest, next, templateVersionId);
      if (!built.ok) {
        setStatus({ kind: "ERROR", message: built.error });
        return;
      }
      const saved = await saveProjectDesign(projectId, built.value);
      // Success only after the server confirmed the write (CLAUDE.md §22),
      // and the fields are refilled from what it actually stored.
      setForm(scriptureFormFrom(saved));
      setStatus({ kind: "SAVED" });
      onSaved();
    } catch (error) {
      setStatus({ kind: "ERROR", message: actionError(error) });
    }
  }

  const verseLeft = SCRIPTURE_VERSE_MAX_LENGTH - form.verse.trim().length;
  const referenceLeft = SCRIPTURE_REFERENCE_MAX_LENGTH - form.reference.trim().length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-content-editor="scripture">
      <h4 className="text-sm font-medium text-slate-800">Cấu hình Lời Chúa</h4>
      <p className="mt-1 text-xs text-slate-500">
        Câu Lời Chúa hiển thị ở hai nơi trong thiệp: dòng nhỏ dưới ảnh cưới lớn và mục “Lời Chúa”. Để trống để dùng câu mặc định của
        mẫu. Đây là bản nháp — chưa xuất bản.
      </p>

      <label htmlFor={verseId} className="mt-3 block text-sm font-medium text-slate-700">
        Nội dung câu Lời Chúa
      </label>
      <textarea
        id={verseId}
        rows={3}
        maxLength={SCRIPTURE_VERSE_MAX_LENGTH}
        className={`${INPUT_CLASS} mt-1`}
        value={form.verse}
        placeholder={SCRIPTURE_DEFAULT_VERSE}
        aria-describedby={`${verseId}-hint`}
        onChange={(event) => setForm((current) => ({ ...current, verse: event.target.value }))}
      />
      <p id={`${verseId}-hint`} className="mt-1 text-xs text-slate-500">
        Mặc định: “{SCRIPTURE_DEFAULT_VERSE}” — còn {String(verseLeft)} ký tự.
      </p>

      <label htmlFor={referenceId} className="mt-3 block text-sm font-medium text-slate-700">
        Nguồn trích dẫn
      </label>
      <input
        id={referenceId}
        type="text"
        maxLength={SCRIPTURE_REFERENCE_MAX_LENGTH}
        className={`${INPUT_CLASS} mt-1`}
        value={form.reference}
        placeholder={SCRIPTURE_DEFAULT_REFERENCE}
        aria-describedby={`${referenceId}-hint`}
        onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
      />
      <p id={`${referenceId}-hint`} className="mt-1 text-xs text-slate-500">
        Mặc định: {SCRIPTURE_DEFAULT_REFERENCE} — còn {String(referenceLeft)} ký tự. Nếu bạn nhập câu riêng mà bỏ trống ô này, thiệp
        sẽ không ghi nguồn nào (không tự gán {SCRIPTURE_DEFAULT_REFERENCE}).
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={busy} onClick={() => void save(form)}>
          {busy ? "Đang lưu..." : "Lưu"}
        </button>
        <button
          type="button"
          className={SMALL_BUTTON_CLASS}
          disabled={busy}
          onClick={() => {
            const defaults = scriptureDefaultForm();
            setForm(defaults);
            void save(defaults);
          }}
        >
          Khôi phục mặc định
        </button>
      </div>
      <StatusLine status={status} />
    </div>
  );
}

export function ScriptureEditor({
  projectId,
  templateVersionId,
  onSaved,
}: {
  projectId: string;
  templateVersionId: string;
  onSaved: () => void;
}) {
  const query = adminQueries.designAndCatalog(projectId);
  const { data, loading, error, reload } = useAdminQuery(query.fetch, [projectId], { cacheKey: query.key });
  if (loading) return <LoadingState label="Đang tải cấu hình Lời Chúa..." />;
  if (error || !data) return <ErrorState message={error ?? "Không thể tải cấu hình Lời Chúa"} onRetry={reload} />;
  return (
    <ScriptureEditorView
      projectId={projectId}
      templateVersionId={templateVersionId}
      initialDesign={data.design}
      onSaved={onSaved}
    />
  );
}
