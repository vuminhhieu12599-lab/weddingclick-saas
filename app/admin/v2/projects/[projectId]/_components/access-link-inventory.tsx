"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchProjectAccessLinks, revokeProjectAccessLink } from "../../../../../../lib/admin/admin-api-client";
import { AdminApiError } from "../../../../../../lib/admin/admin-api-error";
import { ACCESS_LINK_STATUS_LABELS, ACCESS_LINK_TYPE_LABELS } from "../../../../../../lib/presentation/access-link-labels";
import { formatDateTimeVi } from "../../../../../../lib/presentation/format-date";
import type { AccessLinkInventoryItem } from "../../../../../../lib/server/access-links/access-link-inventory-types";

export type InventoryNotice = { kind: "SUCCESS" | "ERROR"; message: string };

const LIST_ERROR = "Không thể tải danh sách liên kết truy cập. Vui lòng thử lại.";

/** Fixed Vietnamese messages for a failed revoke; never the server's raw text. */
export function revokeErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    switch (error.status) {
      case 401:
        return "Phiên đăng nhập nhân sự đã hết hạn. Vui lòng đăng nhập lại.";
      case 403:
        return "Tài khoản không có quyền thu hồi liên kết.";
      case 404:
        return "Không tìm thấy liên kết này trong dự án.";
      case 409:
        return "Liên kết này đã được thu hồi trước đó.";
    }
  }
  return "Không thể thu hồi liên kết lúc này. Vui lòng thử lại.";
}

export interface RevokeOutcome {
  items: AccessLinkInventoryItem[] | null;
  listError: string | null;
  notice: InventoryNotice;
}

/**
 * Revoke through the server, then ALWAYS re-read the authoritative list —
 * never an optimistic local edit. Success is reported only after the server
 * confirmed the revoke.
 */
export async function revokeThenReload(
  projectId: string,
  accessLinkId: string,
  api: {
    revoke: (projectId: string, accessLinkId: string) => Promise<void>;
    fetch: (projectId: string) => Promise<AccessLinkInventoryItem[]>;
  },
): Promise<RevokeOutcome> {
  let notice: InventoryNotice;
  try {
    await api.revoke(projectId, accessLinkId);
    notice = { kind: "SUCCESS", message: "Đã thu hồi liên kết. Liên kết cũ không còn sử dụng được." };
  } catch (error) {
    notice = { kind: "ERROR", message: revokeErrorMessage(error) };
  }

  try {
    return { items: await api.fetch(projectId), listError: null, notice };
  } catch {
    return { items: null, listError: LIST_ERROR, notice };
  }
}

export interface AccessLinkInventoryViewProps {
  items: AccessLinkInventoryItem[] | null;
  loading: boolean;
  listError: string | null;
  notice: InventoryNotice | null;
  confirmingId: string | null;
  pendingId: string | null;
  onReload: () => void;
  onAskRevoke: (id: string) => void;
  onCancelRevoke: () => void;
  onConfirmRevoke: (id: string) => void;
}

function AccessLinkRow({
  item,
  confirming,
  pending,
  busy,
  onAskRevoke,
  onCancelRevoke,
  onConfirmRevoke,
}: {
  item: AccessLinkInventoryItem;
  confirming: boolean;
  pending: boolean;
  busy: boolean;
  onAskRevoke: (id: string) => void;
  onCancelRevoke: () => void;
  onConfirmRevoke: (id: string) => void;
}) {
  const active = item.status === "ACTIVE";
  return (
    <li className="py-3" data-access-link-status={item.status} data-access-link-type={item.linkType}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            {ACCESS_LINK_TYPE_LABELS[item.linkType]}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {ACCESS_LINK_STATUS_LABELS[item.status]}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Tạo lúc: {formatDateTimeVi(item.createdAt)}</p>
          {item.lastUsedAt !== null && (
            <p className="text-xs text-slate-500">Dùng gần nhất: {formatDateTimeVi(item.lastUsedAt)}</p>
          )}
          {item.expiresAt !== null && <p className="text-xs text-slate-500">Hết hạn: {formatDateTimeVi(item.expiresAt)}</p>}
          {item.revokedAt !== null && <p className="text-xs text-slate-500">Thu hồi lúc: {formatDateTimeVi(item.revokedAt)}</p>}
        </div>
        {active && !confirming && (
          <button
            type="button"
            onClick={() => onAskRevoke(item.id)}
            disabled={busy}
            className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-xs sm:py-1.5 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:w-auto"
          >
            Thu hồi link
          </button>
        )}
      </div>
      {active && confirming && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3" data-testid="access-link-revoke-confirm">
          <p className="text-xs text-red-800">
            Link cũ sẽ ngừng hoạt động ngay lập tức và không thể khôi phục. Nếu khách vẫn cần truy cập, hãy tạo link mới.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-mobile-stack>
            <button
              type="button"
              onClick={() => onConfirmRevoke(item.id)}
              disabled={pending}
              className="rounded-lg bg-red-600 px-3 py-2.5 text-xs sm:py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "Đang thu hồi..." : "Xác nhận thu hồi"}
            </button>
            <button
              type="button"
              onClick={onCancelRevoke}
              disabled={pending}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs sm:py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Presentational inventory (no data access); every row is server-provided state. */
export function AccessLinkInventoryView(props: AccessLinkInventoryViewProps) {
  const { items, loading, listError, notice, confirmingId, pendingId } = props;
  const busy = pendingId !== null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="access-link-inventory">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Liên kết truy cập</p>
          <p className="mt-1 text-xs text-slate-500">
            Toàn bộ link Cổng khách hàng, Duyệt thiệp và Thu thập thông tin của dự án. Link gốc chỉ hiển thị một lần khi tạo và không thể xem lại; thu hồi link cũ nếu nghi bị lộ.
          </p>
        </div>
        <button
          type="button"
          onClick={props.onReload}
          disabled={loading || busy}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs sm:py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
        >
          Tải lại
        </button>
      </div>

      {notice !== null && (
        <p
          className={`mt-3 text-sm ${notice.kind === "SUCCESS" ? "text-emerald-700" : "text-red-700"}`}
          role={notice.kind === "ERROR" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      )}
      {listError !== null && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {listError}
        </p>
      )}
      {loading && items === null && <p className="mt-3 text-sm text-slate-500">Đang tải liên kết truy cập...</p>}
      {items !== null && items.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">Dự án chưa có liên kết truy cập nào.</p>
      )}
      {items !== null && items.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100">
          {items.map((item) => (
            <AccessLinkRow
              key={item.id}
              item={item}
              confirming={confirmingId === item.id}
              pending={pendingId === item.id}
              busy={busy}
              onAskRevoke={props.onAskRevoke}
              onCancelRevoke={props.onCancelRevoke}
              onConfirmRevoke={props.onConfirmRevoke}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Launch Hardening 02 / P0-1: staff inventory of the Project's INTAKE/REVIEW/
 * PORTAL capability links with in-page revoke confirmation. Loads from the
 * server on mount, on "Tải lại" and after every revoke attempt. Holds no
 * token material.
 */
export function AccessLinkInventory({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<AccessLinkInventoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<InventoryNotice | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadToken, setLoadToken] = useState(0);

  const reload = useCallback(() => {
    setNotice(null);
    setLoadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setListError(null);
      try {
        const result = await fetchProjectAccessLinks(projectId);
        if (!cancelled) setItems(result);
      } catch {
        if (!cancelled) setListError(LIST_ERROR);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, loadToken]);

  async function confirmRevoke(accessLinkId: string) {
    if (pendingId !== null) {
      return;
    }
    setPendingId(accessLinkId);
    setNotice(null);
    const outcome = await revokeThenReload(projectId, accessLinkId, {
      revoke: revokeProjectAccessLink,
      fetch: fetchProjectAccessLinks,
    });
    if (outcome.items !== null) {
      setItems(outcome.items);
    }
    setListError(outcome.listError);
    setNotice(outcome.notice);
    setConfirmingId(null);
    setPendingId(null);
  }

  return (
    <AccessLinkInventoryView
      items={items}
      loading={loading}
      listError={listError}
      notice={notice}
      confirmingId={confirmingId}
      pendingId={pendingId}
      onReload={reload}
      onAskRevoke={(id) => {
        setNotice(null);
        setConfirmingId(id);
      }}
      onCancelRevoke={() => setConfirmingId(null)}
      onConfirmRevoke={(id) => void confirmRevoke(id)}
    />
  );
}
