"use client";

import Link from "next/link";
import { useState } from "react";

import {
  createProjectEvent,
  fetchProjectEvents,
  fetchWeddingDetails,
  saveWeddingDetails,
  updateProjectEvent,
} from "../../../../../../lib/admin/admin-api-client";
import {
  buildCeremonyEventBody,
  buildWeddingDetailsSaveBody,
  CEREMONY_SLOTS,
  ceremonyFormFrom,
  coupleNamesFormFrom,
  EMPTY_CEREMONY_FORM,
  findCeremonySlotEvent,
  type CeremonyEventForm,
  type CeremonySlot,
  type CoupleNamesForm,
} from "../../../../../../lib/admin/required-invitation-data";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { ProjectEventRecord } from "../../../../../../lib/server/project-events/project-events-types";
import type { WeddingDetailsRecord } from "../../../../../../lib/server/wedding-details/wedding-details-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";

export type CardStatus = { kind: "IDLE" } | { kind: "SAVING" } | { kind: "SAVED" } | { kind: "ERROR"; message: string };

const IDLE: CardStatus = { kind: "IDLE" };

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "time";
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_CLASS}
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

function CardFooter({ status, onSave }: { status: CardStatus; onSave: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={status.kind === "SAVING"}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
      >
        {status.kind === "SAVING" ? "Đang lưu..." : "Lưu"}
      </button>
      {status.kind === "SAVED" && <span className="text-sm text-emerald-700">Đã lưu.</span>}
      {status.kind === "ERROR" && <span className="text-sm text-red-600">{status.message}</span>}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `Không thể lưu: ${error.message}` : "Không thể lưu.";
}

export interface RequiredInvitationDataEditorProps {
  projectId: string;
  initialDetails: WeddingDetailsRecord | null;
  initialEvents: readonly ProjectEventRecord[];
}

/** Only the data the frozen Snapshot builder requires: couple names + the GROOM/BRIDE ceremony events. */
export function RequiredInvitationDataEditor({ projectId, initialDetails, initialEvents }: RequiredInvitationDataEditorProps) {
  const [details, setDetails] = useState(initialDetails);
  const [events, setEvents] = useState<readonly ProjectEventRecord[]>(initialEvents);
  const [names, setNames] = useState<CoupleNamesForm>(() => coupleNamesFormFrom(initialDetails));
  const [namesStatus, setNamesStatus] = useState<CardStatus>(IDLE);
  const [slotForms, setSlotForms] = useState<Record<string, CeremonyEventForm>>(() => {
    const forms: Record<string, CeremonyEventForm> = {};
    for (const slot of CEREMONY_SLOTS) {
      const state = findCeremonySlotEvent(initialEvents, slot);
      forms[slot.side] = state.kind === "EXISTING" ? ceremonyFormFrom(state.event) : EMPTY_CEREMONY_FORM;
    }
    return forms;
  });
  const [slotStatus, setSlotStatus] = useState<Record<string, CardStatus>>({});
  const [savedAny, setSavedAny] = useState(false);

  async function saveNames() {
    const validated = buildWeddingDetailsSaveBody(details, names);
    if (!validated.ok) {
      setNamesStatus({ kind: "ERROR", message: validated.error });
      return;
    }
    setNamesStatus({ kind: "SAVING" });
    try {
      // The PUT is a full replace: rebuild from the latest saved row so fields
      // edited elsewhere on this page (Gift / Love Story) are never reverted.
      const built = buildWeddingDetailsSaveBody(await fetchWeddingDetails(projectId), names);
      if (!built.ok) {
        setNamesStatus({ kind: "ERROR", message: built.error });
        return;
      }
      const result = await saveWeddingDetails(projectId, built.body);
      setDetails(result.weddingDetails);
      setNames(coupleNamesFormFrom(result.weddingDetails));
      setNamesStatus({ kind: "SAVED" });
      setSavedAny(true);
    } catch (error) {
      setNamesStatus({ kind: "ERROR", message: errorMessage(error) });
    }
  }

  async function saveSlot(slot: CeremonySlot) {
    const state = findCeremonySlotEvent(events, slot);
    if (state.kind === "AMBIGUOUS") {
      return;
    }
    const existing = state.kind === "EXISTING" ? state.event : null;
    const built = buildCeremonyEventBody(slot, slotForms[slot.side], existing);
    const setStatus = (status: CardStatus) => setSlotStatus((current) => ({ ...current, [slot.side]: status }));
    if (!built.ok) {
      setStatus({ kind: "ERROR", message: built.error });
      return;
    }
    setStatus({ kind: "SAVING" });
    try {
      const saved = existing
        ? (await updateProjectEvent(projectId, existing.id, built.body)).event
        : (await createProjectEvent(projectId, built.body)).event;
      setEvents((current) => [...current.filter((event) => event.id !== saved.id), saved]);
      setSlotForms((current) => ({ ...current, [slot.side]: ceremonyFormFrom(saved) }));
      setStatus({ kind: "SAVED" });
      setSavedAny(true);
    } catch (error) {
      setStatus({ kind: "ERROR", message: errorMessage(error) });
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Thông tin bắt buộc cho thiệp</h3>
          <p className="mt-1 text-xs text-slate-500">
            Thiệp chung và thiệp nhà trai cần Lễ Thành Hôn; thiệp nhà gái cần Lễ Vu Quy. Đây là bản nháp — chưa xuất bản.
          </p>
        </div>
        {savedAny && (
          <Link
            href={`/admin/v2/projects/${encodeURIComponent(projectId)}/preview`}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Xem trước thiệp
          </Link>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 p-4">
        <h4 className="text-sm font-medium text-slate-800">Cô dâu & chú rể</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Tên chú rể"
            required
            value={names.groomName}
            onChange={(groomName) => setNames((current) => ({ ...current, groomName }))}
          />
          <Field
            label="Tên cô dâu"
            required
            value={names.brideName}
            onChange={(brideName) => setNames((current) => ({ ...current, brideName }))}
          />
        </div>
        <CardFooter status={namesStatus} onSave={() => void saveNames()} />
      </div>

      {CEREMONY_SLOTS.map((slot) => {
        const state = findCeremonySlotEvent(events, slot);
        const form = slotForms[slot.side];
        const update = (patch: Partial<CeremonyEventForm>) =>
          setSlotForms((current) => ({ ...current, [slot.side]: { ...current[slot.side], ...patch } }));
        return (
          <div key={slot.side} className="mt-4 rounded-lg border border-slate-200 p-4" data-slot={slot.side}>
            <h4 className="text-sm font-medium text-slate-800">{slot.label}</h4>
            {state.kind === "AMBIGUOUS" ? (
              <p className="mt-2 text-sm text-amber-700">
                Dự án có {state.count} sự kiện cùng loại cho bên này và chưa có sự kiện chính — cần trình chỉnh sửa sự kiện
                đầy đủ để chọn.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-400">
                  {state.kind === "EXISTING" ? `Đang sửa sự kiện đã có (múi giờ ${state.event.timezone}).` : "Chưa có — sẽ tạo mới."}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Tên lễ" required value={form.title} onChange={(title) => update({ title })} />
                  <Field label="Địa điểm" value={form.venueName} onChange={(venueName) => update({ venueName })} />
                  <Field label="Ngày" type="date" required value={form.date} onChange={(date) => update({ date })} />
                  <Field label="Giờ" type="time" required value={form.time} onChange={(time) => update({ time })} />
                  <Field label="Địa chỉ" value={form.address} onChange={(address) => update({ address })} />
                  <Field
                    label="Ngày âm lịch"
                    value={form.lunarDateDisplay}
                    onChange={(lunarDateDisplay) => update({ lunarDateDisplay })}
                    hint="Không bắt buộc. Hiển thị đúng như nhập, không tự tính."
                  />
                </div>
                <CardFooter status={slotStatus[slot.side] ?? IDLE} onSave={() => void saveSlot(slot)} />
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function RequiredInvitationData({ projectId }: { projectId: string }) {
  const { data, loading, error, reload } = useAdminQuery(async () => {
    const [details, events] = await Promise.all([fetchWeddingDetails(projectId), fetchProjectEvents(projectId)]);
    return { details, events };
  }, [projectId]);

  if (loading) {
    return <LoadingState label="Đang tải thông tin cưới..." />;
  }
  if (error || !data) {
    return <ErrorState message={error ?? "Không thể tải thông tin cưới"} onRetry={reload} />;
  }
  return <RequiredInvitationDataEditor projectId={projectId} initialDetails={data.details} initialEvents={data.events} />;
}
