"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { GUEST_DISPLAY_NAME_MAX_LENGTH, type InvitationVariant } from "../../../lib/domain";
import type { CustomerPortalGuestRow, PortalGuestToolMode } from "../../../lib/server/customer-portal/portal-guest-types";

const VARIANT_LABELS: Readonly<Record<InvitationVariant, string>> = {
  COMMON: "Thiệp chung",
  GROOM: "Thiệp nhà trai",
  BRIDE: "Thiệp nhà gái",
};

type Side = "GROOM" | "BRIDE";
type Notice = { tone: "ok" | "error"; text: string };
/** Task 033E-B — the one-time raw link, in component memory only (never storage, URL or metadata). */
type IssuedLink = { guestId: string; path: string; regenerated: boolean };
type CopyState = "IDLE" | "COPIED" | "FAILED";

/** Fixed Vietnamese messages; server text is never shown to the customer. */
export function guestToolErrorNotice(status: number, reason: unknown): Notice {
  if (status === 409 && reason === "SIDE_LOCKED") {
    return { tone: "error", text: "Khách đã được cấp link riêng nên không thể đổi bên nhà trai/nhà gái." };
  }
  if (status === 409 && (reason === "GUEST_REVOKED" || reason === "ALREADY_REVOKED")) {
    return { tone: "error", text: "Khách này đã được thu hồi." };
  }
  if (status === 409) {
    return { tone: "error", text: "Danh sách vừa thay đổi. Trang đã được tải lại, vui lòng thử lại." };
  }
  if (status === 422) {
    return { tone: "error", text: "Thiệp của khách này chưa sẵn sàng để tạo link. Vui lòng liên hệ WeddingClick." };
  }
  if (status === 400) {
    return { tone: "error", text: `Thông tin chưa hợp lệ. Tên khách cần từ 1 đến ${GUEST_DISPLAY_NAME_MAX_LENGTH} ký tự.` };
  }
  if (status === 403) {
    return { tone: "error", text: "Gói của bạn hiện không có công cụ quản lý khách mời. Vui lòng liên hệ WeddingClick." };
  }
  if (status === 404) {
    return { tone: "error", text: "Không tìm thấy khách mời hoặc link không còn hiệu lực." };
  }
  if (status === 401 || status === 410) {
    return { tone: "error", text: "Link không còn hiệu lực. Vui lòng liên hệ WeddingClick để nhận link mới." };
  }
  return { tone: "error", text: "Chưa lưu được thay đổi. Vui lòng thử lại." };
}

function SidePicker({ name, value, onChange, disabled }: { name: string; value: Side | null; onChange: (side: Side) => void; disabled: boolean }) {
  return (
    <fieldset className="flex gap-2" disabled={disabled}>
      <legend className="sr-only">Bên mời</legend>
      {(["GROOM", "BRIDE"] as const).map((side) => (
        <label
          key={side}
          className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-center text-sm ${value === side ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700"}`}
        >
          <input type="radio" name={name} className="sr-only" checked={value === side} onChange={() => onChange(side)} />
          {side === "GROOM" ? "Nhà trai" : "Nhà gái"}
        </label>
      ))}
    </fieldset>
  );
}

interface PortalGuestToolProps {
  readonly token: string;
  readonly mode: PortalGuestToolMode;
  readonly guests: readonly CustomerPortalGuestRow[];
}

/** Relative `/i/<slug>/g/<token>` from the server → absolute with this origin (no SITE_URL exists). */
function absoluteLink(path: string): string {
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

/** "COPIED" only after the clipboard write resolved; any failure (or no clipboard API) is "FAILED". */
export async function copyPersonalizedLink(writeText: ((text: string) => Promise<void>) | undefined, url: string): Promise<CopyState> {
  try {
    if (writeText === undefined) return "FAILED";
    await writeText(url);
    return "COPIED";
  } catch {
    return "FAILED";
  }
}

/**
 * One-time personalized link panel (Task 033E-B). On a copy failure the link
 * stays visible for manual copy.
 */
export function IssuedLinkPanel({ link, onClose }: { link: IssuedLink; onClose: () => void }) {
  const [copy, setCopy] = useState<CopyState>("IDLE");
  const url = absoluteLink(link.path);

  async function handleCopy() {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    setCopy(await copyPersonalizedLink(clipboard === undefined ? undefined : (text) => clipboard.writeText(text), url));
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" data-portal-guest-issued-link>
      <p className="font-medium">{link.regenerated ? "Đã tạo link mới. Link cũ không còn hiệu lực." : "Đã tạo link riêng cho khách."}</p>
      <p className="text-xs">Link này chỉ hiển thị một lần. Hãy sao chép và gửi cho khách mời.</p>
      <input
        readOnly
        aria-label="Link riêng của khách"
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="min-h-11 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-stone-800"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void handleCopy()} className="min-h-11 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">
          Sao chép link
        </button>
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-900">
          Đóng
        </button>
        <span role="status" className="text-xs">
          {copy === "COPIED" ? "Đã sao chép" : copy === "FAILED" ? "Không sao chép được. Hãy chọn link ở ô trên và sao chép thủ công." : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * Task 033E-A Guest Tool (Customer Portal). Sends only { displayName[,
 * invitationVariant] } with the PORTAL token as Bearer; the server binds the
 * Project and re-checks the add-on. The token lives only in this component's
 * props (no browser storage). One synchronous pending guard for every action;
 * success only after the server confirmed, then the list re-renders from the
 * server. No restore or delete.
 *
 * Task 033E-B: "Tạo link" (ISSUE) / "Tạo lại link" (REGENERATE, after an
 * in-page confirmation) send only `{ action }`; the server decides validity
 * from canonical state. The returned raw link is shown once from component
 * memory and dropped on close, on a later issue, on revoke and on reload.
 */
export function PortalGuestTool({ token, mode, guests }: PortalGuestToolProps) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSide, setNewSide] = useState<Side | null>(null);
  const [editing, setEditing] = useState<{ guestId: string; name: string; side: Side | null } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState<string | null>(null);
  const [issuedLink, setIssuedLink] = useState<IssuedLink | null>(null);

  /** The parsed 2xx body, or `null` after a failure notice. */
  async function send(path: string, method: "POST" | "PATCH", body: unknown, okText: string): Promise<{ payload: unknown } | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
      if (response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        setNotice({ tone: "ok", text: okText });
        router.refresh();
        return { payload };
      }
      const payload: unknown = await response.json().catch(() => null);
      const reason = typeof payload === "object" && payload !== null && "reason" in payload ? payload.reason : undefined;
      setNotice(guestToolErrorNotice(response.status, reason));
      if (response.status === 409) router.refresh();
      return null;
    } catch {
      setNotice(guestToolErrorNotice(0, undefined));
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function submitNew() {
    if (newName.trim() === "") {
      setNotice({ tone: "error", text: "Vui lòng nhập tên khách." });
      return;
    }
    if (mode === "GROOM_OR_BRIDE" && newSide === null) {
      setNotice({ tone: "error", text: "Vui lòng chọn khách nhà trai hoặc nhà gái." });
      return;
    }
    const body = mode === "GROOM_OR_BRIDE" ? { displayName: newName.trim(), invitationVariant: newSide } : { displayName: newName.trim() };
    if (await send("/api/v2/public/portal/guests", "POST", body, "Đã thêm khách.")) {
      setAdding(false);
      setNewName("");
      setNewSide(null);
    }
  }

  async function submitEdit(guest: CustomerPortalGuestRow) {
    if (editing === null) return;
    if (editing.name.trim() === "") {
      setNotice({ tone: "error", text: "Vui lòng nhập tên khách." });
      return;
    }
    const sideEditable = mode === "GROOM_OR_BRIDE" && guest.linkStatus === "NOT_ISSUED";
    const body = sideEditable && editing.side !== null ? { displayName: editing.name.trim(), invitationVariant: editing.side } : { displayName: editing.name.trim() };
    if (await send(`/api/v2/public/portal/guests/${encodeURIComponent(guest.guestId)}`, "PATCH", body, "Đã lưu thay đổi.")) {
      setEditing(null);
    }
  }

  async function submitRevoke(guest: CustomerPortalGuestRow) {
    if (await send(`/api/v2/public/portal/guests/${encodeURIComponent(guest.guestId)}/revoke`, "POST", undefined, "Đã thu hồi khách.")) {
      setConfirmRevoke(null);
      setIssuedLink((current) => (current?.guestId === guest.guestId ? null : current));
    }
  }

  async function submitLink(guest: CustomerPortalGuestRow, action: "ISSUE" | "REGENERATE") {
    // Any previously shown raw link is dropped before a new request.
    setIssuedLink(null);
    const okText = action === "ISSUE" ? "Đã tạo link." : "Đã tạo lại link.";
    const sent = await send(`/api/v2/public/portal/guests/${encodeURIComponent(guest.guestId)}/access-link`, "POST", { action }, okText);
    setConfirmRegenerate(null);
    if (sent === null) return;
    const data = typeof sent.payload === "object" && sent.payload !== null && "data" in sent.payload ? sent.payload.data : null;
    const path = typeof data === "object" && data !== null && "personalizedUrl" in data ? data.personalizedUrl : null;
    if (typeof path !== "string" || !path.startsWith("/i/")) {
      setNotice({ tone: "error", text: "Link đã được tạo nhưng không hiển thị được. Vui lòng bấm Tạo lại link." });
      return;
    }
    setIssuedLink({ guestId: guest.guestId, path, regenerated: action === "REGENERATE" });
  }

  const active = guests.filter((guest) => guest.status === "ACTIVE");
  const revoked = guests.filter((guest) => guest.status === "REVOKED");

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Danh sách khách mời" data-portal-guest-tool={mode}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-stone-900">Danh sách khách mời</h2>
        {!adding && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setAdding(true);
              setNotice(null);
            }}
            className="min-h-11 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            Thêm khách
          </button>
        )}
      </div>

      {notice !== null && (
        <p role="status" className={`mt-3 text-sm ${notice.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>
          {notice.text}
        </p>
      )}

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl bg-stone-50 p-3" data-portal-guest-add>
          <label className="block text-sm text-stone-700" htmlFor="portal-guest-new-name">
            Tên khách (ví dụ: Anh Hiếu và gia đình)
          </label>
          <input
            id="portal-guest-new-name"
            value={newName}
            maxLength={GUEST_DISPLAY_NAME_MAX_LENGTH}
            disabled={pending}
            onChange={(event) => setNewName(event.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
          />
          {mode === "GROOM_OR_BRIDE" && <SidePicker name="portal-guest-new-side" value={newSide} onChange={setNewSide} disabled={pending} />}
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={submitNew} className="min-h-11 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              Lưu
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setAdding(false);
                setNewName("");
                setNewSide(null);
              }}
              className="min-h-11 rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 disabled:opacity-50"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}

      {guests.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600" data-portal-guest-empty>
          Chưa có khách mời nào.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-100">
          {active.map((guest) => {
            const isEditing = editing?.guestId === guest.guestId;
            const sideEditable = mode === "GROOM_OR_BRIDE" && guest.linkStatus === "NOT_ISSUED";
            return (
              <li key={guest.guestId} className="py-3" data-portal-guest-row="ACTIVE">
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      aria-label="Tên khách"
                      value={editing.name}
                      maxLength={GUEST_DISPLAY_NAME_MAX_LENGTH}
                      disabled={pending}
                      onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-base"
                    />
                    {sideEditable ? (
                      <SidePicker name={`portal-guest-side-${guest.guestId}`} value={editing.side} onChange={(side) => setEditing({ ...editing, side })} disabled={pending} />
                    ) : (
                      guest.invitationVariant !== null && (
                        <p className="text-xs text-stone-500">
                          {VARIANT_LABELS[guest.invitationVariant]}
                          {mode === "GROOM_OR_BRIDE" && " · đã cấp link nên không đổi bên"}
                        </p>
                      )
                    )}
                    <div className="flex gap-2">
                      <button type="button" disabled={pending} onClick={() => submitEdit(guest)} className="min-h-11 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                        Lưu
                      </button>
                      <button type="button" disabled={pending} onClick={() => setEditing(null)} className="min-h-11 rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 disabled:opacity-50">
                        Huỷ
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="break-words text-sm font-medium text-stone-900">{guest.displayName}</p>
                    <p className="text-xs text-stone-500">
                      {guest.invitationVariant === null ? "Chưa chọn nhà trai/nhà gái" : VARIANT_LABELS[guest.invitationVariant]} ·{" "}
                      {guest.linkStatus === "ISSUED" ? "Đã cấp link" : "Chưa cấp link"}
                    </p>
                    {issuedLink?.guestId === guest.guestId && <IssuedLinkPanel key={issuedLink.path} link={issuedLink} onClose={() => setIssuedLink(null)} />}
                    {confirmRegenerate === guest.guestId ? (
                      <div className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900" data-portal-guest-regenerate-confirm>
                        <p>Tạo lại link sẽ làm link cũ không còn hiệu lực. Khách sẽ cần link mới để mở thiệp.</p>
                        <div className="mt-2 flex gap-2">
                          <button type="button" disabled={pending} onClick={() => submitLink(guest, "REGENERATE")} className="min-h-11 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                            Xác nhận tạo lại
                          </button>
                          <button type="button" disabled={pending} onClick={() => setConfirmRegenerate(null)} className="min-h-11 rounded-lg border border-amber-200 px-3 py-1.5 text-sm disabled:opacity-50">
                            Huỷ
                          </button>
                        </div>
                      </div>
                    ) : confirmRevoke === guest.guestId ? (
                      <div className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">
                        <p>Thu hồi khách này? Link riêng (nếu có) sẽ ngừng hoạt động ngay. Phản hồi tham dự đã gửi vẫn được giữ.</p>
                        <div className="mt-2 flex gap-2">
                          <button type="button" disabled={pending} onClick={() => submitRevoke(guest)} className="min-h-11 rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                            Xác nhận thu hồi
                          </button>
                          <button type="button" disabled={pending} onClick={() => setConfirmRevoke(null)} className="min-h-11 rounded-lg border border-red-200 px-3 py-1.5 text-sm disabled:opacity-50">
                            Huỷ
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="-ml-2 mt-1 flex flex-wrap gap-1">
                        {guest.invitationVariant !== null && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              setConfirmRevoke(null);
                              setEditing(null);
                              setNotice(null);
                              if (guest.linkStatus === "ISSUED") {
                                setConfirmRegenerate(guest.guestId);
                              } else {
                                void submitLink(guest, "ISSUE");
                              }
                            }}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-sm font-medium text-stone-900 underline disabled:opacity-50"
                          >
                            {guest.linkStatus === "ISSUED" ? "Tạo lại link" : "Tạo link"}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setEditing({ guestId: guest.guestId, name: guest.displayName, side: guest.invitationVariant === "GROOM" || guest.invitationVariant === "BRIDE" ? guest.invitationVariant : null });
                            setConfirmRevoke(null);
                            setConfirmRegenerate(null);
                            setNotice(null);
                          }}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-sm text-stone-700 underline disabled:opacity-50"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setConfirmRevoke(guest.guestId);
                            setConfirmRegenerate(null);
                            setEditing(null);
                            setNotice(null);
                          }}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-sm text-red-700 underline disabled:opacity-50"
                        >
                          Thu hồi
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
          {revoked.map((guest) => (
            <li key={guest.guestId} className="py-3 opacity-60" data-portal-guest-row="REVOKED">
              <p className="break-words text-sm text-stone-500 line-through">{guest.displayName}</p>
              <p className="text-xs text-stone-500">Đã thu hồi — link không còn hiệu lực</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
