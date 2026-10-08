"use client";

import { useState } from "react";

import {
  deleteProjectMedia,
  fetchProjectMedia,
  updateProjectMediaSortOrder,
  uploadProjectMedia,
} from "../../../../../../lib/admin/admin-api-client";
import { isOptimizableImageMediaType } from "../../../../../../lib/admin/image-upload-optimizer";
import {
  MEDIA_EDITOR_ROLES,
  mediaDimensionsLabel,
  mediaOfRole,
  moveItem,
  reorderPlan,
  sortOrderForReplacement,
  sortOrdersForAppend,
  validateMediaFile,
  type MediaRoleConfig,
} from "../../../../../../lib/admin/optional-content-editor";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { ProjectMediaRecord } from "../../../../../../lib/server/media/media-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import { actionError, SMALL_BUTTON_CLASS, type CardStatus, StatusLine } from "./optional-content-shared";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function MediaRoleCard({
  role,
  items,
  status,
  onUpload,
  onDelete,
  onMove,
}: {
  role: MediaRoleConfig;
  items: ProjectMediaRecord[];
  status: CardStatus;
  onUpload: (files: File[]) => void;
  onDelete: (item: ProjectMediaRecord) => void;
  onMove: (index: number, delta: -1 | 1) => void;
}) {
  const busy = status.kind === "SAVING";
  const single = role.cardinality === "SINGLE";
  const accept = role.mediaType === "AUDIO" ? "audio/mpeg,audio/mp4" : "image/jpeg,image/png,image/webp";
  return (
    <div className="rounded-lg border border-slate-200 p-4" data-media-role={role.mediaType}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium text-slate-800">{role.label}</h4>
          <p className="mt-0.5 text-xs text-slate-400">{role.hint}</p>
        </div>
        <label className={`${SMALL_BUTTON_CLASS} cursor-pointer ${busy ? "pointer-events-none opacity-40" : ""}`}>
          {single ? (items.length > 0 ? "Thay tệp" : "Tải lên") : "Thêm tệp"}
          <input
            type="file"
            className="sr-only"
            accept={accept}
            multiple={!single}
            disabled={busy}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) onUpload(files);
            }}
          />
        </label>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">{role.emptyLabel ?? "Chưa có tệp."}</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {items.map((item, index) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="font-medium text-slate-800">#{index + 1}</span>
              {single && index === 0 && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">Đang dùng</span>
              )}
              {single && index > 0 && <span className="text-slate-400">Bản cũ (không hiển thị)</span>}
              <span>{item.mimeType ?? "—"}</span>
              <span>{formatSize(item.sizeBytes)}</span>
              {mediaDimensionsLabel(item) !== null && <span>{mediaDimensionsLabel(item)}</span>}
              <span className="text-slate-400">{new Date(item.createdAt).toLocaleString("vi-VN")}</span>
              <span className="ml-auto flex gap-1">
                {!single && (
                  <>
                    <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy || index === 0} onClick={() => onMove(index, -1)} aria-label="Lên">
                      ↑
                    </button>
                    <button
                      type="button"
                      className={SMALL_BUTTON_CLASS}
                      disabled={busy || index === items.length - 1}
                      onClick={() => onMove(index, 1)}
                      aria-label="Xuống"
                    >
                      ↓
                    </button>
                  </>
                )}
                <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy} onClick={() => onDelete(item)}>
                  Xoá
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <StatusLine status={status} />
    </div>
  );
}

export function MediaEditorView({
  projectId,
  initialMedia,
  onSaved,
  roles = MEDIA_EDITOR_ROLES,
}: {
  projectId: string;
  initialMedia: readonly ProjectMediaRecord[];
  onSaved: () => void;
  /** TE-05A: the role cards to show; defaults to every legacy role (Elegant Editorial behaviour unchanged). */
  roles?: readonly MediaRoleConfig[];
}) {
  const [rows, setRows] = useState<ProjectMediaRecord[]>([...initialMedia]);
  const [status, setStatus] = useState<Record<string, CardStatus>>({});
  const setRoleStatus = (mediaType: string, next: CardStatus) => setStatus((current) => ({ ...current, [mediaType]: next }));

  async function upload(role: MediaRoleConfig, files: File[]) {
    for (const file of files) {
      const invalid = validateMediaFile(role.mediaType, file);
      if (invalid) {
        setRoleStatus(role.mediaType, { kind: "ERROR", message: `${file.name}: ${invalid}` });
        return;
      }
    }
    const sortOrders =
      role.cardinality === "SINGLE"
        ? [sortOrderForReplacement(rows, role.mediaType)]
        : sortOrdersForAppend(rows, role.mediaType, files.length);
    const toUpload = role.cardinality === "SINGLE" ? files.slice(0, 1) : files;
    const progressVerb = isOptimizableImageMediaType(role.mediaType) ? "Đang tối ưu và tải" : "Đang tải";
    for (const [index, file] of toUpload.entries()) {
      setRoleStatus(role.mediaType, { kind: "SAVING", label: `${progressVerb} ${index + 1}/${toUpload.length}...` });
      try {
        const media = await uploadProjectMedia(projectId, role.mediaType, file, sortOrders[index]);
        setRows((current) => [...current, media]);
        onSaved();
      } catch (error) {
        setRoleStatus(role.mediaType, { kind: "ERROR", message: `${file.name}: ${actionError(error)}` });
        return;
      }
    }
    setRoleStatus(role.mediaType, { kind: "SAVED" });
  }

  async function remove(role: MediaRoleConfig, item: ProjectMediaRecord) {
    if (!window.confirm("Xoá tệp này khỏi dự án?")) return;
    setRoleStatus(role.mediaType, { kind: "SAVING" });
    try {
      await deleteProjectMedia(projectId, item.id);
      setRows((current) => current.filter((row) => row.id !== item.id));
      setRoleStatus(role.mediaType, { kind: "SAVED" });
      onSaved();
    } catch (error) {
      setRoleStatus(role.mediaType, { kind: "ERROR", message: actionError(error) });
    }
  }

  async function move(role: MediaRoleConfig, index: number, delta: -1 | 1) {
    const plan = reorderPlan(moveItem(mediaOfRole(rows, role.mediaType), index, delta));
    setRoleStatus(role.mediaType, { kind: "SAVING" });
    try {
      for (const step of plan) {
        const updated = await updateProjectMediaSortOrder(projectId, step.id, step.sortOrder);
        setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      }
      setRoleStatus(role.mediaType, { kind: "SAVED" });
      onSaved();
    } catch (error) {
      setRoleStatus(role.mediaType, { kind: "ERROR", message: actionError(error) });
      setRows(await fetchProjectMedia(projectId).catch(() => rows));
    }
  }

  return (
    <div className="space-y-3">
      {roles.map((role) => (
        <MediaRoleCard
          key={role.mediaType}
          role={role}
          items={mediaOfRole(rows, role.mediaType)}
          status={status[role.mediaType] ?? { kind: "IDLE" }}
          onUpload={(files) => void upload(role, files)}
          onDelete={(item) => void remove(role, item)}
          onMove={(index, delta) => void move(role, index, delta)}
        />
      ))}
    </div>
  );
}

export function MediaEditor({
  projectId,
  onSaved,
  roles,
}: {
  projectId: string;
  onSaved: () => void;
  roles?: readonly MediaRoleConfig[];
}) {
  const { data, loading, error, reload } = useAdminQuery(() => fetchProjectMedia(projectId), [projectId]);
  if (loading) return <LoadingState label="Đang tải ảnh & âm thanh..." />;
  if (error || !data) return <ErrorState message={error ?? "Không thể tải ảnh & âm thanh"} onRetry={reload} />;
  return <MediaEditorView projectId={projectId} initialMedia={data} onSaved={onSaved} roles={roles} />;
}
