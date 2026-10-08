"use client";

import { useState } from "react";

import {
  deleteProjectMedia,
  fetchPhotoLibrary,
  fetchTemplateMediaSlots,
  setTemplateMediaSlot,
  uploadProjectMedia,
} from "../../../../../../lib/admin/admin-api-client";
import { AdminApiError } from "../../../../../../lib/admin/admin-api-error";
import { mediaDimensionsLabel, validateMediaFile } from "../../../../../../lib/admin/optional-content-editor";
import {
  applyPick,
  assignmentsBySlot,
  isSelectableForSlot,
  moveAt,
  PHOTO_SOURCE_LABELS,
  photoUploadSortOrders,
  pickerCapacity,
  removeAt,
  slotCountLabel,
} from "../../../../../../lib/admin/template-slot-editor";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { PhotoLibraryItem } from "../../../../../../lib/server/template-editor/photo-library";
import type { TemplateEditorManifestV1, TemplateEditorMediaSlotV1 } from "../../../../../../templates/core/editor-manifest";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import { actionError, PRIMARY_BUTTON_CLASS, SMALL_BUTTON_CLASS, StatusLine, type CardStatus } from "./optional-content-shared";

/** Frozen Staff note (TE-03A): one slot set serves every invitation variant. */
export const SHARED_SLOTS_NOTE = "Bộ ảnh này áp dụng cho các phiên bản thiệp của dự án.";

const TOUCH_BUTTON_CLASS =
  "min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";

function Thumbnail({ photo, className = "" }: { photo: PhotoLibraryItem | undefined; className?: string }) {
  if (photo?.previewUrl) {
    // Short-lived staff-signed preview; never persisted.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo.previewUrl} alt="" loading="lazy" className={`aspect-square w-full rounded-md bg-slate-100 object-cover ${className}`} />;
  }
  return (
    <div className={`flex aspect-square w-full items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400 ${className}`}>
      {photo ? "Không xem được" : "Ảnh không còn"}
    </div>
  );
}

export function PhotoPicker({
  slot,
  current,
  library,
  onCancel,
  onConfirm,
}: {
  slot: TemplateEditorMediaSlotV1;
  current: readonly string[];
  library: readonly PhotoLibraryItem[];
  onCancel: () => void;
  onConfirm: (picked: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const capacity = pickerCapacity(slot, current);
  const single = slot.cardinality === "SINGLE";

  function toggle(id: string) {
    setPicked((selection) => {
      if (selection.includes(id)) return selection.filter((entry) => entry !== id);
      if (single) return [id];
      return selection.length >= capacity ? selection : [...selection, id];
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Chọn ảnh cho ${slot.label}`} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" data-photo-picker>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-xl bg-white sm:rounded-xl">
        <div className="border-b border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-800">Chọn ảnh — {slot.label}</h4>
          <p className="mt-1 text-xs text-slate-500">
            {single ? "Chọn 1 ảnh (thay ảnh hiện tại)." : `Có thể chọn thêm ${capacity} ảnh, theo thứ tự bấm chọn.`}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {library.length === 0 ? (
            <p className="text-sm text-slate-500">Thư viện chưa có ảnh. Hãy thêm ảnh vào thư viện trước.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {library.map((photo) => {
                const already = !isSelectableForSlot(current, photo.id);
                const order = picked.indexOf(photo.id);
                const full = !single && order === -1 && picked.length >= capacity;
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      onClick={() => toggle(photo.id)}
                      disabled={already || full}
                      aria-pressed={order !== -1}
                      className={`relative block w-full rounded-lg border-2 p-1 text-left disabled:opacity-40 ${order !== -1 ? "border-slate-900" : "border-transparent"}`}
                      data-picker-photo={photo.id}
                    >
                      <Thumbnail photo={photo} />
                      {order !== -1 && (
                        <span className="absolute left-2 top-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">{single ? "✓" : order + 1}</span>
                      )}
                      <span className="mt-1 block truncate text-xs text-slate-600">{PHOTO_SOURCE_LABELS[photo.mediaType]}</span>
                      <span className="block text-xs text-slate-400">{already ? "Đã có trong mục này" : (mediaDimensionsLabel(photo) ?? "—")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end">
          <button type="button" className={TOUCH_BUTTON_CLASS} onClick={onCancel}>
            Huỷ
          </button>
          <button type="button" className={`${PRIMARY_BUTTON_CLASS} min-h-11`} disabled={picked.length === 0} onClick={() => onConfirm(picked)}>
            {single ? "Dùng ảnh này" : `Thêm ${picked.length} ảnh`}
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotCard({
  slot,
  ids,
  library,
  status,
  busy,
  onPick,
  onUpload,
  onChange,
}: {
  slot: TemplateEditorMediaSlotV1;
  ids: readonly string[];
  library: ReadonlyMap<string, PhotoLibraryItem>;
  status: CardStatus;
  busy: boolean;
  onPick: () => void;
  onUpload: (files: File[]) => void;
  onChange: (next: string[]) => void;
}) {
  const single = slot.cardinality === "SINGLE";
  const canAddMore = single || pickerCapacity(slot, ids) > 0;
  return (
    <div className="rounded-lg border border-slate-200 p-4" data-template-slot={slot.key}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-slate-800">
            {slot.label}{" "}
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">
              {slot.requirement === "RECOMMENDED" ? "Nên có" : "Tuỳ chọn"}
            </span>
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">{slot.hint}</p>
        </div>
        <span className="text-sm font-medium text-slate-700" data-slot-count>
          {slotCountLabel(slot, ids.length)}
        </span>
      </div>

      {ids.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Chưa có ảnh.</p>
      ) : (
        <ol className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ids.map((id, index) => {
            const photo = library.get(id);
            return (
              <li key={id} className="rounded-lg bg-slate-50 p-2" data-slot-position={index + 1}>
                <div className="relative">
                  <Thumbnail photo={photo} />
                  <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-xs font-semibold text-slate-800">#{index + 1}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{photo ? (mediaDimensionsLabel(photo) ?? "—") : "—"}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {!single && (
                    <>
                      <button type="button" className={`${TOUCH_BUTTON_CLASS} flex-1 px-2`} disabled={busy || index === 0} onClick={() => onChange(moveAt(ids, index, -1))} aria-label={`Đưa ảnh #${index + 1} lên trước`}>
                        ←
                      </button>
                      <button type="button" className={`${TOUCH_BUTTON_CLASS} flex-1 px-2`} disabled={busy || index === ids.length - 1} onClick={() => onChange(moveAt(ids, index, 1))} aria-label={`Đưa ảnh #${index + 1} ra sau`}>
                        →
                      </button>
                    </>
                  )}
                  <button type="button" className={`${TOUCH_BUTTON_CLASS} flex-1 px-2`} disabled={busy} onClick={() => onChange(removeAt(ids, index))}>
                    Gỡ
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" className={TOUCH_BUTTON_CLASS} disabled={busy || !canAddMore} onClick={onPick}>
          {single && ids.length > 0 ? "Đổi ảnh" : "Chọn ảnh"}
        </button>
        <label className={`${TOUCH_BUTTON_CLASS} inline-flex cursor-pointer items-center justify-center ${busy || !canAddMore ? "pointer-events-none opacity-40" : ""}`}>
          Tải ảnh mới
          <input
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp"
            multiple={!single}
            disabled={busy || !canAddMore}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) onUpload(files);
            }}
          />
        </label>
      </div>
      <StatusLine status={status} />
    </div>
  );
}

export function TemplateMediaSlotEditorView({
  projectId,
  templateVersionId,
  manifest,
  initialLibrary,
  initialAssignments,
  onSaved,
}: {
  projectId: string;
  templateVersionId: string;
  manifest: TemplateEditorManifestV1;
  initialLibrary: readonly PhotoLibraryItem[];
  initialAssignments: Readonly<Record<string, string[]>>;
  onSaved: () => void;
}) {
  const [library, setLibrary] = useState<PhotoLibraryItem[]>([...initialLibrary]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({ ...initialAssignments });
  const [status, setStatus] = useState<Record<string, CardStatus>>({});
  const [libraryStatus, setLibraryStatus] = useState<CardStatus>({ kind: "IDLE" });
  const [pickerSlot, setPickerSlot] = useState<TemplateEditorMediaSlotV1 | null>(null);
  const busy = Object.values(status).some((entry) => entry.kind === "SAVING") || libraryStatus.kind === "SAVING";
  const byId = new Map(library.map((photo) => [photo.id, photo]));
  const setSlotStatus = (key: string, next: CardStatus) => setStatus((current) => ({ ...current, [key]: next }));

  async function writeSlot(slot: TemplateEditorMediaSlotV1, next: string[]) {
    setSlotStatus(slot.key, { kind: "SAVING" });
    try {
      const saved = await setTemplateMediaSlot(projectId, templateVersionId, slot.key, next);
      setAssignments((current) => ({ ...current, [slot.key]: assignmentsBySlot(saved)[slot.key] ?? [] }));
      setSlotStatus(slot.key, { kind: "SAVED" });
      onSaved();
    } catch (error) {
      setSlotStatus(slot.key, { kind: "ERROR", message: actionError(error) });
    }
  }

  /** Existing Task 024 workflow (P1-MEDIA-01 optimization included), mediaType PHOTO only. Resolves to the new ids in upload order. */
  async function uploadPhotos(files: File[], report: (next: CardStatus) => void): Promise<string[] | null> {
    for (const file of files) {
      const invalid = validateMediaFile("PHOTO", file);
      if (invalid) {
        report({ kind: "ERROR", message: `${file.name}: ${invalid}` });
        return null;
      }
    }
    const sortOrders = photoUploadSortOrders(library.filter((photo) => photo.mediaType === "PHOTO").length, files.length);
    const ids: string[] = [];
    for (const [index, file] of files.entries()) {
      report({ kind: "SAVING", label: `Đang tối ưu và tải ${index + 1}/${files.length}...` });
      try {
        const media = await uploadProjectMedia(projectId, "PHOTO", file, sortOrders[index] as number);
        ids.push(media.id);
      } catch (error) {
        report({ kind: "ERROR", message: `${file.name}: ${actionError(error)}` });
        break;
      }
    }
    // Always re-read the library (previews are signed server-side), even after a partial failure.
    try {
      setLibrary(await fetchPhotoLibrary(projectId));
    } catch {
      // The rows exist; the next load shows them.
    }
    if (ids.length > 0) onSaved();
    return ids.length === files.length ? ids : null;
  }

  async function deletePhoto(photo: PhotoLibraryItem) {
    if (!window.confirm("Xoá ảnh này khỏi thư viện dự án?")) return;
    setLibraryStatus({ kind: "SAVING" });
    try {
      await deleteProjectMedia(projectId, photo.id);
      setLibrary((current) => current.filter((entry) => entry.id !== photo.id));
      setLibraryStatus({ kind: "SAVED" });
      onSaved();
    } catch (error) {
      setLibraryStatus({
        kind: "ERROR",
        message: error instanceof AdminApiError && error.status === 409 ? "Ảnh đang được sử dụng và chưa thể xoá." : actionError(error),
      });
    }
  }

  return (
    <div className="space-y-4" data-template-media-slot-editor>
      <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">{SHARED_SLOTS_NOTE}</p>

      {manifest.mediaSlots.map((slot) => {
        const ids = assignments[slot.key] ?? [];
        return (
          <SlotCard
            key={slot.key}
            slot={slot}
            ids={ids}
            library={byId}
            status={status[slot.key] ?? { kind: "IDLE" }}
            busy={busy}
            onPick={() => setPickerSlot(slot)}
            onChange={(next) => void writeSlot(slot, next)}
            onUpload={(files) => {
              const allowed = slot.cardinality === "SINGLE" ? files.slice(0, 1) : files.slice(0, pickerCapacity(slot, ids));
              void uploadPhotos(allowed, (next) => setSlotStatus(slot.key, next)).then((newIds) => {
                if (newIds === null) return;
                const next = applyPick(slot, ids, newIds);
                if (next !== null) void writeSlot(slot, next);
              });
            }}
          />
        );
      })}

      <div className="rounded-lg border border-slate-200 p-4" data-photo-library>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-medium text-slate-800">Thư viện ảnh của dự án</h4>
            <p className="mt-0.5 text-xs text-slate-500">Ảnh đã tải lên trước đây cũng dùng được, không cần tải lại khi đổi mẫu.</p>
          </div>
          <label className={`${TOUCH_BUTTON_CLASS} inline-flex cursor-pointer items-center justify-center ${busy ? "pointer-events-none opacity-40" : ""}`}>
            Thêm ảnh vào thư viện
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length > 0) {
                  void uploadPhotos(files, setLibraryStatus).then((ids) => {
                    if (ids !== null) setLibraryStatus({ kind: "SAVED" });
                  });
                }
              }}
            />
          </label>
        </div>
        {library.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Chưa có ảnh.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {library.map((photo) => (
              <li key={photo.id} data-library-photo={photo.id}>
                <Thumbnail photo={photo} />
                <p className="mt-1 truncate text-xs text-slate-500">{PHOTO_SOURCE_LABELS[photo.mediaType]}</p>
                <button type="button" className={`${SMALL_BUTTON_CLASS} mt-1 min-h-11 w-full`} disabled={busy} onClick={() => void deletePhoto(photo)}>
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        )}
        <StatusLine status={libraryStatus} />
      </div>

      {pickerSlot !== null && (
        <PhotoPicker
          slot={pickerSlot}
          current={assignments[pickerSlot.key] ?? []}
          library={library}
          onCancel={() => setPickerSlot(null)}
          onConfirm={(picked) => {
            const slot = pickerSlot;
            setPickerSlot(null);
            const next = applyPick(slot, assignments[slot.key] ?? [], picked);
            if (next === null) {
              setSlotStatus(slot.key, { kind: "ERROR", message: "Vượt quá số ảnh tối đa của mục này." });
              return;
            }
            void writeSlot(slot, next);
          }}
        />
      )}
    </div>
  );
}

export function TemplateMediaSlotEditor({
  projectId,
  templateVersionId,
  manifest,
  onSaved,
}: {
  projectId: string;
  templateVersionId: string;
  manifest: TemplateEditorManifestV1;
  onSaved: () => void;
}) {
  const { data, loading, error, reload } = useAdminQuery(async () => {
    const [library, slots] = await Promise.all([fetchPhotoLibrary(projectId), fetchTemplateMediaSlots(projectId, templateVersionId)]);
    return { library, assignments: assignmentsBySlot(slots) };
  }, [projectId, templateVersionId]);
  if (loading) return <LoadingState label="Đang tải ảnh của mẫu..." />;
  if (error || !data) return <ErrorState message={error ?? "Không thể tải ảnh của mẫu"} onRetry={reload} />;
  return (
    <TemplateMediaSlotEditorView
      key={templateVersionId}
      projectId={projectId}
      templateVersionId={templateVersionId}
      manifest={manifest}
      initialLibrary={data.library}
      initialAssignments={data.assignments}
      onSaved={onSaved}
    />
  );
}
