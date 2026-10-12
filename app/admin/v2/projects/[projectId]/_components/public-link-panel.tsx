"use client";

import { useState } from "react";

import { buildInvitationPublicAlias, invitationPublicAliasPath } from "../../../../../../lib/domain";
import { assignInvitationPublicAlias } from "../../../../../../lib/admin/admin-api-client";
import { AdminApiError } from "../../../../../../lib/admin/admin-api-error";
import type { PublishedVariantPublicLink } from "../../../../../../lib/server/invitation-publish/invitation-publish-types";
import { PREVIEW_VARIANT_LABELS } from "../preview/_components/preview-state";

/**
 * LAUNCH-P0-02 failure of a friendly-link assignment, shaped for Staff.
 * `manual` asks Staff to choose another readable alias; `suggestion` is the
 * attempted alias split into its two name parts (for prefilling).
 */
export interface FriendlyLinkFailure {
  message: string;
  manual: boolean;
  suggestion: { primary: string; secondary: string } | null;
}

function splitAlias(alias: unknown): FriendlyLinkFailure["suggestion"] {
  if (typeof alias !== "string") return null;
  const [primary, secondary] = alias.split("&");
  return primary && secondary ? { primary, secondary } : null;
}

/** Fixed Vietnamese staff messages; publication itself is never reported as failed here. */
export function friendlyLinkFailure(error: unknown): FriendlyLinkFailure {
  if (error instanceof AdminApiError) {
    const body = (typeof error.body === "object" && error.body !== null ? error.body : {}) as { reason?: unknown; alias?: unknown };
    switch (error.status) {
      case 401:
        return { message: "Phiên đăng nhập nhân sự đã hết hạn. Vui lòng đăng nhập lại.", manual: false, suggestion: null };
      case 403:
        return { message: "Tài khoản không có quyền tạo link thiệp.", manual: false, suggestion: null };
      case 400:
        return { message: "Link không hợp lệ: chỉ dùng chữ không dấu, số và dấu gạch ngang cho mỗi tên.", manual: true, suggestion: null };
      case 409:
        if (body.reason === "ALIAS_TAKEN") {
          return {
            message: `Link “${typeof body.alias === "string" ? invitationPublicAliasPath(body.alias) : ""}” đã được dùng cho một thiệp khác. Hãy chọn tên khác bên dưới.`,
            manual: true,
            suggestion: splitAlias(body.alias),
          };
        }
        if (body.reason === "ALIAS_ALREADY_ASSIGNED") {
          return { message: "Thiệp này đã có link đẹp. Đã tải lại trạng thái.", manual: false, suggestion: null };
        }
        return { message: "Thiệp chưa được xuất bản nên chưa thể tạo link đẹp.", manual: false, suggestion: null };
      case 422:
        return body.reason === "ALIAS_UNDERIVABLE"
          ? { message: "Không tạo được link từ tên cô dâu chú rể. Hãy nhập tên cho link bên dưới.", manual: true, suggestion: null }
          : { message: "Chỉ thiệp Nhà trai / Nhà gái mới có link đẹp.", manual: false, suggestion: null };
    }
  }
  return { message: "Chưa tạo được link đẹp lúc này. Thiệp vẫn đã xuất bản — vui lòng thử lại.", manual: false, suggestion: null };
}

function CopyButton({ url, label }: { url: string; label: string }) {
  const [state, setState] = useState<"IDLE" | "COPIED" | "FAILED">("IDLE");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(url).then(
            () => setState("COPIED"),
            () => setState("FAILED"),
          );
        }}
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:min-h-0 sm:py-1.5"
        aria-label={`Sao chép link ${label}`}
      >
        Sao chép link
      </button>
      <span className="text-xs text-slate-500" role="status">
        {state === "COPIED" ? "Đã sao chép" : state === "FAILED" ? "Không sao chép được — hãy chọn và sao chép link thủ công" : ""}
      </span>
    </>
  );
}

/**
 * LAUNCH-P0-02 — the public link(s) of ONE published variant in Xuất bản:
 * the friendly `/i/<alias>` when assigned (else the canonical link), "Mở
 * thiệp", "Sao chép link", and for GROOM/BRIDE without an alias the
 * one-time "Tạo link đẹp" (server-derived default, or a Staff-chosen
 * alternative after a collision). The canonical link stays valid and is
 * shown beneath. Absolute URLs use the browser origin (no SITE_URL).
 */
export function PublicLinkPanel({
  projectId,
  link,
  initialFailure,
  onChanged,
}: {
  projectId: string;
  link: PublishedVariantPublicLink;
  initialFailure?: FriendlyLinkFailure | null;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FriendlyLinkFailure | null>(initialFailure ?? null);
  const [primary, setPrimary] = useState(initialFailure?.suggestion?.primary ?? "");
  const [secondary, setSecondary] = useState(initialFailure?.suggestion?.secondary ?? "");
  const label = PREVIEW_VARIANT_LABELS[link.variant];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const primaryPath = link.friendlyPath ?? link.canonicalPath;
  const url = `${origin}${primaryPath}`;
  const manualAlias = buildInvitationPublicAlias(primary, secondary);

  async function create(alias?: string) {
    if (pending || (link.variant !== "GROOM" && link.variant !== "BRIDE")) return;
    setPending(true);
    try {
      await assignInvitationPublicAlias(projectId, link.variant, alias);
      setFailure(null);
      onChanged();
    } catch (error) {
      const next = friendlyLinkFailure(error);
      setFailure(next);
      if (next.suggestion !== null) {
        setPrimary(next.suggestion.primary);
        setSecondary(next.suggestion.secondary);
      }
      if (error instanceof AdminApiError && error.status === 409) onChanged();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid={`public-link-${link.variant}`}>
      <p className="text-xs font-medium text-slate-600">Link thiệp {label}</p>
      <input
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        className="mt-1 block w-full min-w-0 rounded border border-slate-200 bg-white px-2 py-2 font-mono text-xs text-slate-800 sm:py-1"
        aria-label={`Link thiệp ${label}`}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a
          href={primaryPath}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800 sm:min-h-0 sm:py-1.5"
        >
          Mở thiệp
        </a>
        <CopyButton url={url} label={label} />
      </div>
      {link.friendlyPath !== null && (
        <p className="mt-2 break-all text-xs text-slate-500">
          Link cũ vẫn hoạt động: <span className="font-mono">{link.canonicalPath}</span>
        </p>
      )}

      {link.canCreateFriendlyLink && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="text-xs text-slate-600">
            Link đẹp dùng tên cô dâu chú rể ({link.variant === "GROOM" ? "chú rể trước" : "cô dâu trước"}). Chỉ tạo một lần và không đổi được sau đó; link
            cũ vẫn hoạt động.
          </p>
          {!(failure?.manual ?? false) && (
            <button
              type="button"
              onClick={() => void create()}
              disabled={pending}
              className="mt-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:min-h-0 sm:py-1.5"
            >
              {pending ? "Đang tạo..." : "Tạo link đẹp"}
            </button>
          )}
          {failure?.manual === true && (
            <form
              className="mt-2 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (manualAlias !== null) void create(manualAlias);
              }}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={primary}
                  onChange={(event) => setPrimary(event.target.value)}
                  placeholder={link.variant === "GROOM" ? "Tên chú rể" : "Tên cô dâu"}
                  className="min-h-11 rounded border border-slate-300 bg-white px-2 text-sm sm:min-h-0 sm:py-1"
                  aria-label="Tên thứ nhất trong link"
                />
                <span className="text-sm text-slate-500">&amp;</span>
                <input
                  value={secondary}
                  onChange={(event) => setSecondary(event.target.value)}
                  placeholder={link.variant === "GROOM" ? "Tên cô dâu" : "Tên chú rể"}
                  className="min-h-11 rounded border border-slate-300 bg-white px-2 text-sm sm:min-h-0 sm:py-1"
                  aria-label="Tên thứ hai trong link"
                />
              </div>
              <p className="break-all text-xs text-slate-600">
                Xem trước: <span className="font-mono">{manualAlias === null ? "—" : invitationPublicAliasPath(manualAlias)}</span>
              </p>
              <button
                type="submit"
                disabled={pending || manualAlias === null}
                className="min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 sm:min-h-0 sm:py-1.5"
              >
                {pending ? "Đang tạo..." : "Tạo link đẹp"}
              </button>
            </form>
          )}
        </div>
      )}
      {failure !== null && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {failure.message}
        </p>
      )}
    </div>
  );
}
