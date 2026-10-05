import type { Metadata } from "next";

import type { InvitationVariant } from "../../../lib/domain";
import { createCustomerPortalPageDependencies } from "../../../lib/server/customer-portal/customer-portal-supabase";
import type { CustomerPortalView } from "../../../lib/server/customer-portal/customer-portal-types";
import { loadCustomerPortal } from "../../../lib/server/customer-portal/load-customer-portal";
import { ApiError } from "../../../lib/server/errors/api-error";
import { PortalLinkCopy } from "./portal-link-copy";
import { PortalRsvpList } from "./portal-rsvp-list";

/** Every request re-resolves the PORTAL link and the Project's CURRENT publications. */
export const dynamic = "force-dynamic";

/**
 * Private-by-link: fixed generic title, never indexed, no referrer (the
 * token path never reaches another host), no Open Graph, no couple names,
 * no token. Task 032B metadata is unrelated and unchanged.
 */
export const metadata: Metadata = {
  title: "Cổng khách hàng — WeddingClick",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const VARIANT_LABELS: Readonly<Record<InvitationVariant, string>> = {
  COMMON: "Thiệp chung",
  GROOM: "Thiệp nhà trai",
  BRIDE: "Thiệp nhà gái",
};

function PortalMessage({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-base font-semibold text-stone-900">{title}</h1>
        <p className="mt-2 text-sm text-stone-600">{text}</p>
      </div>
    </main>
  );
}

/** Fixed, safe Vietnamese states — no token, Project or database detail is echoed or logged. */
function portalErrorMessage(error: unknown) {
  if (error instanceof ApiError && (error.kind === "REVOKED_TOKEN" || error.kind === "EXPIRED_TOKEN")) {
    return <PortalMessage title="Link đã hết hiệu lực" text="Vui lòng liên hệ WeddingClick để nhận link mới." />;
  }
  if (error instanceof ApiError && error.kind === "NOT_FOUND") {
    return <PortalMessage title="Không tìm thấy trang" text="Link không hợp lệ. Vui lòng kiểm tra lại link WeddingClick đã gửi." />;
  }
  console.error("[CustomerPortalPage] Unexpected error");
  return <PortalMessage title="Chưa thể hiển thị trang" text="Vui lòng thử lại sau ít phút." />;
}

/**
 * Private Customer Portal (Task 033C). The customer never logs in: the
 * opaque PORTAL access link in the path is resolved server-side (Task 026,
 * PORTAL only — REVIEW/INTAKE links, guest tokens and public slugs never
 * open it) to exactly one Project. Read-only and post-publish: a summary
 * from the immutable PUBLISHED Snapshot(s) and that Project's public
 * invitation links, plus (Task 033D) the read-only RSVP list of that same
 * resolved Project. No Guest Tool yet; no RSVP, editing, publishing,
 * payment or lifecycle action exists here.
 */
export default async function CustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let view: CustomerPortalView;
  try {
    view = await loadCustomerPortal(token, createCustomerPortalPageDependencies());
  } catch (error) {
    return portalErrorMessage(error);
  }
  if (view.status === "NOT_READY") {
    return <PortalMessage title="Thiệp chưa được xuất bản" text="WeddingClick đang hoàn thiện thiệp của bạn. Vui lòng quay lại sau." />;
  }

  const headline = view.invitations[0];
  return (
    <main className="min-h-svh bg-stone-50 px-4 py-8">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-stone-500">Cổng khách hàng WeddingClick</p>
          <h1 className="text-xl font-semibold text-stone-900">
            {headline.primaryName} &amp; {headline.secondaryName}
          </h1>
          <p className="text-sm text-emerald-700">Thiệp đã xuất bản</p>
        </header>

        <section className="space-y-3" aria-label="Thiệp đã xuất bản">
          {view.invitations.map((card) => (
            <div key={card.variant} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" data-portal-invitation={card.variant}>
              <p className="text-sm font-semibold text-stone-900">{VARIANT_LABELS[card.variant]}</p>
              <p className="mt-1 text-sm text-stone-700">
                {card.primaryName} &amp; {card.secondaryName}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {card.ceremonyTitle} · {card.ceremonyDate.time} {card.ceremonyDate.weekday}, {card.ceremonyDate.day}/{card.ceremonyDate.month}/
                {card.ceremonyDate.year}
              </p>
              <a href={card.invitationPath} target="_blank" rel="noopener" className="mt-3 block break-all font-mono text-xs text-stone-500 underline">
                {card.invitationPath}
              </a>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a
                  href={card.invitationPath}
                  target="_blank"
                  rel="noopener"
                  className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
                >
                  Mở thiệp
                </a>
                <PortalLinkCopy path={card.invitationPath} />
              </div>
            </div>
          ))}
        </section>

        <PortalRsvpList rows={view.rsvps} summary={view.rsvpSummary} />

        {view.personalizedGuestEntitled && (
          <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-5 text-sm text-stone-600">
            Gói của bạn có thiệp mời cá nhân hoá. Công cụ quản lý khách mời và link mời riêng sẽ có tại đây.
          </section>
        )}
      </div>
    </main>
  );
}
