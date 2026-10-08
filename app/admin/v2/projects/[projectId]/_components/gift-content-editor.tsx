"use client";

import { useState } from "react";

import { fetchWeddingDetails, saveWeddingDetails, uploadProjectMedia } from "../../../../../../lib/admin/admin-api-client";
import {
  buildWeddingDetailsPatchBody,
  giftContentFormFrom,
  validateMediaFile,
  type GiftContentField,
  type GiftContentForm,
  type GiftQrPatch,
} from "../../../../../../lib/admin/optional-content-editor";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { WeddingDetailsRecord } from "../../../../../../lib/server/wedding-details/wedding-details-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import {
  actionError,
  type CardStatus,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SMALL_BUTTON_CLASS,
  StatusLine,
} from "./optional-content-shared";

const GIFT_SIDES = [
  {
    side: "GROOM",
    title: "Quà mừng — Nhà trai",
    qrType: "QR_GROOM",
    qrField: "groomBankQrMediaId",
    fields: [
      ["groomBankName", "Ngân hàng"],
      ["groomBankAccountName", "Chủ tài khoản"],
      ["groomBankAccountNumber", "Số tài khoản"],
    ],
  },
  {
    side: "BRIDE",
    title: "Quà mừng — Nhà gái",
    qrType: "QR_BRIDE",
    qrField: "brideBankQrMediaId",
    fields: [
      ["brideBankName", "Ngân hàng"],
      ["brideBankAccountName", "Chủ tài khoản"],
      ["brideBankAccountNumber", "Số tài khoản"],
    ],
  },
] as const satisfies readonly {
  side: string;
  title: string;
  qrType: "QR_GROOM" | "QR_BRIDE";
  qrField: keyof GiftQrPatch;
  fields: readonly (readonly [GiftContentField, string])[];
}[];

/**
 * Love Story text + per-side Gift (bank + QR) through the existing canonical
 * wedding_details PUT. Each side's QR is its own role (QR_GROOM / QR_BRIDE)
 * and its own reference; there is no common QR and no cross-side fallback.
 */
export function GiftContentEditorView({
  projectId,
  initialDetails,
  onSaved,
  showLoveStory = true,
  showGift = true,
}: {
  projectId: string;
  initialDetails: WeddingDetailsRecord | null;
  onSaved: () => void;
  /** TE-05A: shown only when the selected template's manifest lists LOVE_STORY / GIFT. Saving still rebuilds the full row, so hidden fields are never reverted. */
  showLoveStory?: boolean;
  showGift?: boolean;
}) {
  const [details, setDetails] = useState(initialDetails);
  const [form, setForm] = useState<GiftContentForm>(() => giftContentFormFrom(initialDetails));
  const [status, setStatus] = useState<CardStatus>({ kind: "IDLE" });
  const busy = status.kind === "SAVING";

  /** Full-replace PUT rebuilt from the latest saved row, so other cards' fields are never reverted. */
  async function persist(edits: { form?: GiftContentForm; qr?: GiftQrPatch }, before?: () => Promise<GiftQrPatch>) {
    setStatus({ kind: "SAVING" });
    try {
      const latest = await fetchWeddingDetails(projectId);
      if (latest === null) {
        // Checked before any QR upload, so no orphan media is created.
        setStatus({ kind: "ERROR", message: "Cần lưu tên cô dâu và chú rể trước." });
        return;
      }
      const qr = before ? await before() : edits.qr;
      const built = buildWeddingDetailsPatchBody(latest, { form: edits.form, qr });
      if (!built.ok) {
        setStatus({ kind: "ERROR", message: built.error });
        return;
      }
      const result = await saveWeddingDetails(projectId, built.value);
      setDetails(result.weddingDetails);
      if (edits.form) setForm(giftContentFormFrom(result.weddingDetails));
      setStatus({ kind: "SAVED" });
      onSaved();
    } catch (error) {
      setStatus({ kind: "ERROR", message: actionError(error) });
    }
  }

  function uploadQr(side: (typeof GIFT_SIDES)[number], file: File) {
    const invalid = validateMediaFile(side.qrType, file);
    if (invalid) return setStatus({ kind: "ERROR", message: invalid });
    void persist({}, async () => {
      const media = await uploadProjectMedia(projectId, side.qrType, file, 0);
      return { [side.qrField]: media.id };
    });
  }

  const update = (field: GiftContentField, value: string) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-medium text-slate-800">
        {showLoveStory && showGift ? "Chuyện tình yêu & quà mừng" : showLoveStory ? "Chuyện tình yêu" : "Quà mừng"}
      </h4>
      {details === null && <p className="mt-1 text-xs text-amber-700">Cần lưu tên cô dâu và chú rể trước.</p>}

      {showLoveStory && (
        <label className="mt-3 block text-sm">
          <span className="font-medium text-slate-700">Chuyện tình yêu</span>
          <textarea rows={4} className={`${INPUT_CLASS} mt-1`} value={form.loveStory} onChange={(e) => update("loveStory", e.target.value)} />
        </label>
      )}

      {showGift && (
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {GIFT_SIDES.map((side) => {
          const qrId = details?.[side.qrField] ?? null;
          return (
            <div key={side.side} data-gift-side={side.side} className="space-y-2">
              <p className="text-sm font-medium text-slate-700">{side.title}</p>
              {side.fields.map(([field, label]) => (
                <label key={field} className="block text-xs text-slate-600">
                  {label}
                  <input className={`${INPUT_CLASS} mt-1`} value={form[field]} onChange={(e) => update(field, e.target.value)} />
                </label>
              ))}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={qrId ? "text-emerald-700" : "text-slate-400"}>{qrId ? "Đã có mã QR" : "Chưa có mã QR"}</span>
                <label className={`${SMALL_BUTTON_CLASS} cursor-pointer ${busy ? "pointer-events-none opacity-40" : ""}`}>
                  {qrId ? "Thay QR" : "Tải QR"}
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) uploadQr(side, file);
                    }}
                  />
                </label>
                {qrId && (
                  <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy} onClick={() => void persist({ qr: { [side.qrField]: null } })}>
                    Gỡ QR
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      <button type="button" className={`${PRIMARY_BUTTON_CLASS} mt-4`} disabled={busy} onClick={() => void persist({ form })}>
        {busy ? "Đang lưu..." : "Lưu"}
      </button>
      <StatusLine status={status} />
    </div>
  );
}

export function GiftContentEditor({
  projectId,
  onSaved,
  showLoveStory,
  showGift,
}: {
  projectId: string;
  onSaved: () => void;
  showLoveStory?: boolean;
  showGift?: boolean;
}) {
  const { data, loading, error, reload } = useAdminQuery(() => fetchWeddingDetails(projectId), [projectId]);
  if (loading) return <LoadingState label="Đang tải nội dung..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <GiftContentEditorView projectId={projectId} initialDetails={data} onSaved={onSaved} showLoveStory={showLoveStory} showGift={showGift} />;
}
