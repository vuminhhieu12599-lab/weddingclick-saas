"use client";

import { useState } from "react";

import { fetchWeddingDetails, saveWeddingDetails } from "../../../../../../lib/admin/admin-api-client";
import {
  buildWeddingDetailsPatchBody,
  familyFormFrom,
  type FamilyField,
  type FamilyForm,
} from "../../../../../../lib/admin/optional-content-editor";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { WeddingDetailsRecord } from "../../../../../../lib/server/wedding-details/wedding-details-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import { actionError, type CardStatus, INPUT_CLASS, PRIMARY_BUTTON_CLASS, StatusLine } from "./optional-content-shared";

const FAMILY_SIDES = [
  {
    side: "GROOM",
    title: "Gia đình nhà trai",
    fields: [
      ["groomFather", "Tên bố chú rể"],
      ["groomMother", "Tên mẹ chú rể"],
      ["groomFamilyAddress", "Địa chỉ nhà trai"],
    ],
  },
  {
    side: "BRIDE",
    title: "Gia đình nhà gái",
    fields: [
      ["brideFather", "Tên bố cô dâu"],
      ["brideMother", "Tên mẹ cô dâu"],
      ["brideFamilyAddress", "Địa chỉ nhà gái"],
    ],
  },
] as const satisfies readonly { side: string; title: string; fields: readonly (readonly [FamilyField, string])[] }[];

/** Canonical family fields of wedding_details only; every blank field is saved as null, nothing is invented. */
export function FamilyEditorView({
  projectId,
  initialDetails,
  onSaved,
}: {
  projectId: string;
  initialDetails: WeddingDetailsRecord | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FamilyForm>(() => familyFormFrom(initialDetails));
  const [status, setStatus] = useState<CardStatus>({ kind: "IDLE" });

  async function save() {
    setStatus({ kind: "SAVING" });
    try {
      // Full-replace PUT rebuilt from the latest saved row, so other cards' fields are never reverted.
      const built = buildWeddingDetailsPatchBody(await fetchWeddingDetails(projectId), { family: form });
      if (!built.ok) {
        setStatus({ kind: "ERROR", message: built.error });
        return;
      }
      const result = await saveWeddingDetails(projectId, built.value);
      setForm(familyFormFrom(result.weddingDetails));
      setStatus({ kind: "SAVED" });
      onSaved();
    } catch (error) {
      setStatus({ kind: "ERROR", message: actionError(error) });
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-medium text-slate-800">Gia đình</h4>
      <p className="mt-0.5 text-xs text-slate-400">Không bắt buộc. Để trống nếu không muốn hiển thị.</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {FAMILY_SIDES.map((side) => (
          <div key={side.side} data-family-side={side.side} className="space-y-2">
            <p className="text-sm font-medium text-slate-700">{side.title}</p>
            {side.fields.map(([field, label]) => (
              <label key={field} className="block text-xs text-slate-600">
                {label}
                <input
                  className={`${INPUT_CLASS} mt-1`}
                  value={form[field]}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm((current) => ({ ...current, [field]: value }));
                  }}
                />
              </label>
            ))}
          </div>
        ))}
      </div>
      <button type="button" className={`${PRIMARY_BUTTON_CLASS} mt-4`} disabled={status.kind === "SAVING"} onClick={() => void save()}>
        {status.kind === "SAVING" ? "Đang lưu..." : "Lưu"}
      </button>
      <StatusLine status={status} />
    </div>
  );
}

export function FamilyEditor({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const { data, loading, error, reload } = useAdminQuery(() => fetchWeddingDetails(projectId), [projectId]);
  if (loading) return <LoadingState label="Đang tải thông tin gia đình..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <FamilyEditorView projectId={projectId} initialDetails={data} onSaved={onSaved} />;
}
