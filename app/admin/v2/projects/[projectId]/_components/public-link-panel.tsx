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
            message: `Link “${typeof body.alias === "string" ? invitationPublicAliasPath(body.alias) : ""}” đã được dùng cho một thiệp khác. Hãy sửa tên bên trên rồi xác nhận lại.`,
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
          ? { message: "Link chưa hợp lệ. Hãy nhập tên cho link rồi xác nhận lại.", manual: true, suggestion: null }
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

type SubmitOutcome = { status: "CREATED" } | { status: "INVALID" } | { status: "FAILED"; failure: FriendlyLinkFailure; reload: boolean };

/**
 * Writes exactly the alias Staff reviewed (two name parts, normalized with
 * the canonical domain rule). Invalid input never reaches the server; a
 * collision keeps the form open (no reload) so Staff can pick another name.
 */
export async function submitFriendlyLink(
  projectId: string,
  variant: "GROOM" | "BRIDE",
  primary: string,
  secondary: string,
  assign: typeof assignInvitationPublicAlias = assignInvitationPublicAlias,
): Promise<SubmitOutcome> {
  const alias = buildInvitationPublicAlias(primary, secondary);
  if (alias === null) return { status: "INVALID" };
  try {
    await assign(projectId, variant, alias);
    return { status: "CREATED" };
  } catch (error) {
    const failure = friendlyLinkFailure(error);
    return { status: "FAILED", failure, reload: error instanceof AdminApiError && error.status === 409 && !failure.manual };
  }
}

/** The review step (presentational): editable name parts, live final URL, permanence warning, explicit confirm. */
export function FriendlyLinkReviewForm({
  variant,
  origin,
  primary,
  secondary,
  pending,
  onPrimaryChange,
  onSecondaryChange,
  onConfirm,
  onCancel,
}: {
  variant: "GROOM" | "BRIDE";
  origin: string;
  primary: string;
  secondary: string;
  pending: boolean;
  onPrimaryChange: (value: string) => void;
  onSecondaryChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const finalAlias = buildInvitationPublicAlias(primary, secondary);
  return (
    <form
      className="mt-3 space-y-2 border-t border-slate-200 pt-3"
      role="group"
      aria-label="Xem lại link đẹp"
      data-testid={`friendly-link-review-${variant}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (finalAlias !== null) onConfirm();
      }}
    >
      <p className="text-xs text-slate-600">
        Đề xuất từ tên trong bản xuất bản ({variant === "GROOM" ? "chú rể trước, cô dâu sau" : "cô dâu trước, chú rể sau"}). Có thể sửa từng tên;
        dấu tiếng Việt và khoảng trắng được chuyển tự động.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={primary}
          onChange={(event) => onPrimaryChange(event.target.value)}
          placeholder={variant === "GROOM" ? "Tên chú rể" : "Tên cô dâu"}
          className="min-h-11 rounded border border-slate-300 bg-white px-2 text-sm sm:min-h-0 sm:py-1"
          aria-label="Tên thứ nhất trong link"
        />
        <span className="text-sm text-slate-500">&amp;</span>
        <input
          value={secondary}
          onChange={(event) => onSecondaryChange(event.target.value)}
          placeholder={variant === "GROOM" ? "Tên cô dâu" : "Tên chú rể"}
          className="min-h-11 rounded border border-slate-300 bg-white px-2 text-sm sm:min-h-0 sm:py-1"
          aria-label="Tên thứ hai trong link"
        />
      </div>
      <p className="break-all text-sm text-slate-800" data-testid={`friendly-link-preview-${variant}`}>
        Link cuối cùng: <span className="font-mono">{finalAlias === null ? "— (cần đủ hai tên hợp lệ)" : `${origin}${invitationPublicAliasPath(finalAlias)}`}</span>
      </p>
      <p className="text-xs font-medium text-amber-800">
        Lưu ý: sau khi xác nhận, link này được cố định vĩnh viễn và không thể sửa hoặc đổi sang tên khác. Link cũ vẫn tiếp tục hoạt động.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row" data-mobile-stack>
        <button
          type="submit"
          disabled={pending || finalAlias === null}
          className="min-h-11 rounded-lg bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 sm:min-h-0 sm:py-1.5"
        >
          {pending ? "Đang tạo..." : "Xác nhận tạo link"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:min-h-0 sm:py-1.5"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}

function splitSuggestion(alias: string | null): { primary: string; secondary: string } {
  return splitAlias(alias) ?? { primary: "", secondary: "" };
}

/**
 * LAUNCH-P0-02 — the public link(s) of ONE published variant in Xuất bản:
 * the friendly `/i/<alias>` when assigned (else the canonical link), "Mở
 * thiệp" and "Sao chép link". For GROOM/BRIDE without an alias, "Tạo link
 * đẹp" opens a review step: the server-proposed alias (from the PUBLISHED
 * names) prefilled in two editable name parts, the normalized final URL in
 * real time, a permanence warning, and an explicit "Xác nhận tạo link".
 * Nothing is written before that confirmation, and never on publish. A
 * collision keeps the form open for another readable alternative. The
 * canonical link stays valid. Absolute URLs use the browser origin.
 */
export function PublicLinkPanel({
  projectId,
  link,
  onChanged,
}: {
  projectId: string;
  link: PublishedVariantPublicLink;
  onChanged: () => void;
}) {
  const suggestion = splitSuggestion(link.suggestedAlias);
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FriendlyLinkFailure | null>(null);
  const [primary, setPrimary] = useState(suggestion.primary);
  const [secondary, setSecondary] = useState(suggestion.secondary);
  const label = PREVIEW_VARIANT_LABELS[link.variant];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const primaryPath = link.friendlyPath ?? link.canonicalPath;
  const url = `${origin}${primaryPath}`;

  async function confirm() {
    if (pending || (link.variant !== "GROOM" && link.variant !== "BRIDE")) return;
    setPending(true);
    try {
      const outcome = await submitFriendlyLink(projectId, link.variant, primary, secondary);
      if (outcome.status === "CREATED") {
        setFailure(null);
        setReviewing(false);
        onChanged();
      } else if (outcome.status === "FAILED") {
        setFailure(outcome.failure);
        if (outcome.reload) onChanged();
      }
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

      {link.canCreateFriendlyLink && !reviewing && (
        <button
          type="button"
          onClick={() => setReviewing(true)}
          className="mt-3 min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
        >
          Tạo link đẹp
        </button>
      )}

      {link.canCreateFriendlyLink && reviewing && (link.variant === "GROOM" || link.variant === "BRIDE") && (
        <FriendlyLinkReviewForm
          variant={link.variant}
          origin={origin}
          primary={primary}
          secondary={secondary}
          pending={pending}
          onPrimaryChange={setPrimary}
          onSecondaryChange={setSecondary}
          onConfirm={() => void confirm()}
          onCancel={() => {
            setReviewing(false);
            setFailure(null);
          }}
        />
      )}
      {failure !== null && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {failure.message}
        </p>
      )}
    </div>
  );
}
