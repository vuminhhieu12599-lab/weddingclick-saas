"use client";

import { useId, useState } from "react";

import { fetchWeddingDetails, saveWeddingDetails } from "../../../../../../lib/admin/admin-api-client";
import { adminQueries } from "../../../../../../lib/admin/admin-queries";
import { buildWeddingDetailsPatchBody } from "../../../../../../lib/admin/optional-content-editor";
import { useAdminQuery } from "../../../../../../lib/admin/use-admin-query";
import type { WeddingDetailsRecord } from "../../../../../../lib/server/wedding-details/wedding-details-types";
import { ErrorState, LoadingState } from "../../../_components/page-states";
import { actionError, type CardStatus, INPUT_CLASS, PRIMARY_BUTTON_CLASS, StatusLine } from "./optional-content-shared";

/**
 * Canonical wedding_details.invitationMessage through the existing
 * full-replace PUT. Shown only when the selected template's manifest lists
 * INVITATION_MESSAGE. Blank clears it (the template's own default applies).
 */
export function InvitationMessageEditorView({
  projectId,
  initialDetails,
  onSaved,
}: {
  projectId: string;
  initialDetails: WeddingDetailsRecord | null;
  onSaved: () => void;
}) {
  const fieldId = useId();
  const [details, setDetails] = useState(initialDetails);
  const [message, setMessage] = useState(initialDetails?.invitationMessage ?? "");
  const [status, setStatus] = useState<CardStatus>({ kind: "IDLE" });
  const busy = status.kind === "SAVING";

  /** Rebuilt from the latest saved row so fields edited elsewhere are never reverted. */
  async function save() {
    setStatus({ kind: "SAVING" });
    try {
      const latest = await fetchWeddingDetails(projectId);
      const built = buildWeddingDetailsPatchBody(latest, { invitationMessage: message });
      if (!built.ok) {
        setStatus({ kind: "ERROR", message: built.error });
        return;
      }
      const result = await saveWeddingDetails(projectId, built.value);
      setDetails(result.weddingDetails);
      setMessage(result.weddingDetails.invitationMessage ?? "");
      setStatus({ kind: "SAVED" });
      onSaved();
    } catch (error) {
      setStatus({ kind: "ERROR", message: actionError(error) });
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-content-editor="invitation-message">
      <h4 className="text-sm font-medium text-slate-800">Lời mời</h4>
      {details === null && <p className="mt-1 text-xs text-amber-700">Cần lưu tên cô dâu và chú rể trước.</p>}
      <label htmlFor={fieldId} className="mt-3 block text-sm font-medium text-slate-700">
        Nội dung lời mời
      </label>
      <textarea
        id={fieldId}
        rows={5}
        className={`${INPUT_CLASS} mt-1`}
        value={message}
        aria-describedby={`${fieldId}-hint`}
        onChange={(event) => setMessage(event.target.value)}
      />
      <p id={`${fieldId}-hint`} className="mt-1 text-xs text-slate-500">
        Nội dung này sẽ hiển thị trong thiệp. Để trống để sử dụng lời mời mặc định của mẫu, nếu mẫu có hỗ trợ.
      </p>
      <button type="button" className={`${PRIMARY_BUTTON_CLASS} mt-4`} disabled={busy} onClick={() => void save()}>
        {busy ? "Đang lưu..." : "Lưu"}
      </button>
      <StatusLine status={status} />
    </div>
  );
}

export function InvitationMessageEditor({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const query = adminQueries.weddingDetails(projectId);
  const { data, loading, error, reload } = useAdminQuery(query.fetch, [projectId], { cacheKey: query.key });
  if (loading) return <LoadingState label="Đang tải lời mời..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <InvitationMessageEditorView projectId={projectId} initialDetails={data} onSaved={onSaved} />;
}
